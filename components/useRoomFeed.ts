"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { parseFeed } from "../lib/feed-parse";
import type { FeedAttempt, FeedSnapshot } from "../lib/feed-types";

// Polling (not Realtime) on purpose in Step 5: it needs no login and spends none of the 100 messages/second
// budget. This hook is the ONLY place that reads the feed, so moving to batched Realtime later
// (docs/CONTRACTS.md, section 13) means replacing this file only.
const POLL_INTERVAL_MS = 2000;
const FINISHED_POLL_INTERVAL_MS = 5000; // nothing new to guess: just notice a closed room
const HIDDEN_CHECK_MS = 2000; // tab in the background: no requests, only a cheap timer
const CATCH_UP_DELAY_MS = 150; // a full page arrived, more are waiting
const PLAYERS_EVERY_N_POLLS = 5; // the nickname list changes slowly: ask for it every ~10 s
const MAX_FAILED_POLLS = 3;
const MAX_KEPT_ATTEMPTS = 200;

export type RoomFeedState = {
  attempts: FeedAttempt[]; // oldest first
  finished: boolean;
  players: string[];
  /** A poll failed and is being retried with backoff. */
  unstable: boolean;
  /** 3 polls failed in a row: show a manual retry button. */
  halted: boolean;
  /** Poll right now (e.g. after sending an attempt). */
  refresh: () => void;
  retry: () => void;
};

export function useRoomFeed(roomCode: string, initial: FeedSnapshot): RoomFeedState {
  const router = useRouter();
  const [attempts, setAttempts] = useState(initial.attempts);
  const [finished, setFinished] = useState(initial.status === "finished");
  const [players, setPlayers] = useState(initial.players ?? []);
  const [unstable, setUnstable] = useState(false);
  const [halted, setHalted] = useState(false);
  const [kick, setKick] = useState(0);
  const cursorRef = useRef(initial.cursor);
  const finishedRef = useRef(initial.status === "finished");
  const pollCountRef = useRef(0);

  useEffect(() => {
    if (halted) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;

    function schedule(delayMs: number) {
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => void poll(), delayMs);
    }

    async function poll() {
      if (cancelled) return;
      if (document.hidden) {
        schedule(HIDDEN_CHECK_MS);
        return;
      }
      const withPlayers = pollCountRef.current % PLAYERS_EVERY_N_POLLS === 0;
      pollCountRef.current += 1;
      const url = `/api/rooms/${roomCode}/feed?after=${cursorRef.current}${withPlayers ? "&players=1" : ""}`;
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (res.status === 401 || res.status === 404 || res.status === 409) {
          // Session lost or room closed: stop polling and let the server render the right screen.
          if (!cancelled) router.refresh();
          return;
        }
        const snapshot = res.ok ? parseFeed(await res.json()) : null;
        if (snapshot === null) throw new Error("bad response");
        if (cancelled) return;

        failures = 0;
        setUnstable(false);
        if (snapshot.attempts.length > 0) {
          cursorRef.current = Math.max(cursorRef.current, snapshot.cursor);
          setAttempts((previous) => {
            const lastKnown = previous[previous.length - 1]?.id ?? 0;
            const fresh = snapshot.attempts.filter((a) => a.id > lastKnown);
            return fresh.length === 0 ? previous : [...previous, ...fresh].slice(-MAX_KEPT_ATTEMPTS);
          });
        }
        if (snapshot.players !== null) setPlayers(snapshot.players);
        const isFinished = snapshot.status === "finished";
        finishedRef.current = isFinished;
        setFinished(isFinished);
        schedule(snapshot.hasMore ? CATCH_UP_DELAY_MS : isFinished ? FINISHED_POLL_INTERVAL_MS : POLL_INTERVAL_MS);
      } catch {
        if (cancelled) return;
        failures += 1;
        setUnstable(true);
        if (failures >= MAX_FAILED_POLLS) {
          setHalted(true); // after 3 attempts show a manual retry button
          return;
        }
        schedule(POLL_INTERVAL_MS * 2 ** failures); // 4 s, then 8 s
      }
    }

    function onVisibility() {
      if (!document.hidden) schedule(0); // came back to the tab: catch up immediately
    }
    document.addEventListener("visibilitychange", onVisibility);

    schedule(kick === 0 ? (finishedRef.current ? FINISHED_POLL_INTERVAL_MS : POLL_INTERVAL_MS) : 0);
    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [roomCode, router, halted, kick]);

  const refresh = useCallback(() => setKick((n) => n + 1), []);
  const retry = useCallback(() => {
    setHalted(false);
    setKick((n) => n + 1);
  }, []);

  return { attempts, finished, players, unstable, halted, refresh, retry };
}
