import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { getFeed } from "./feed.service";

type Answer = { data: unknown; error: { code: string; message: string } | null };

function fakeDb(rpcAnswers: Record<string, Answer>, players: { nickname: string }[] = []) {
  const calls: string[] = [];
  const db = {
    rpc: (fn: string) => {
      calls.push(fn);
      return Promise.resolve(rpcAnswers[fn] ?? { data: null, error: { code: "42883", message: "missing" } });
    },
    from: () => ({
      select: () => ({
        eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: players, error: null }) }) }),
      }),
    }),
  } as unknown as SupabaseClient;
  return { db, calls };
}

const attemptRow = (id: number) => ({ o_id: id, o_nickname: "Ana", o_pokemon: "Mew", o_result: "cold", o_is_winner: false });
const chatRow = (id: number) => ({ o_id: id, o_nickname: "Beto", o_body: "hola", o_is_admin: false });

describe("getFeed", () => {
  it("keeps both cursors when nothing is new and marks a finished room", async () => {
    const { db, calls } = fakeDb({ list_attempts: { data: [], error: null }, list_chat: { data: [], error: null } });
    const feed = await getFeed(db, { id: "room", finishedAt: "2026-11-05T00:00:00Z", phase: "playing" as const, attemptCooldownSeconds: 3 }, { after: 42, chatAfter: 7, full: false });
    expect(feed).toEqual({
      status: "finished",
      cooldownSeconds: 3,
      startDeadlineAt: null,
      serverNow: null,
      attempts: [],
      cursor: 42,
      chat: [],
      chatCursor: 7,
      hasMore: false,
      hints: null,
      players: null,
    });
    expect(calls).not.toContain("list_hints");
  });

  it("uses the last attempt and chat ids as cursors", async () => {
    const { db } = fakeDb({
      list_attempts: { data: [attemptRow(5), attemptRow(9)], error: null },
      list_chat: { data: [chatRow(2), chatRow(3)], error: null },
    });
    const feed = await getFeed(db, { id: "room", finishedAt: null, phase: "playing" as const, attemptCooldownSeconds: 3 }, { after: null, chatAfter: null, full: false });
    expect(feed.cursor).toBe(9);
    expect(feed.chatCursor).toBe(3);
    expect(feed.status).toBe("playing");
    expect(feed.chat[0]?.body).toBe("hola");
  });

  it("adds the hints table on a full refresh", async () => {
    const { db, calls } = fakeDb({
      list_attempts: { data: [], error: null },
      list_chat: { data: [], error: null },
      list_hints: { data: [{ o_pokemon: "Ivysaur", o_result: "fire" }], error: null },
    });
    const feed = await getFeed(db, { id: "room", finishedAt: null, phase: "playing" as const, attemptCooldownSeconds: 3 }, { after: null, chatAfter: null, full: true });
    expect(feed.hints).toEqual([{ pokemon: "Ivysaur", result: "fire" }]);
    expect(calls).toContain("list_hints");
  });

  it("reports a waiting room with its deadline and the database clock", async () => {
    const { db, calls } = fakeDb({
      apply_due_timers: {
        data: [{ o_phase: "waiting", o_start_deadline_at: "2026-11-08T01:05:00Z", o_server_now: "2026-11-08T01:00:00Z" }],
        error: null,
      },
      list_attempts: { data: [], error: null },
      list_chat: { data: [], error: null },
    });
    const feed = await getFeed(db, { id: "room", finishedAt: null, phase: "waiting", attemptCooldownSeconds: 3 }, { after: null, chatAfter: null, full: false });
    expect(feed.status).toBe("waiting");
    expect(feed.startDeadlineAt).toBe("2026-11-08T01:05:00Z");
    expect(feed.serverNow).toBe("2026-11-08T01:00:00Z");
    expect(calls).toContain("apply_due_timers");
  });

  it("switches to playing when the timer was due, and sends no deadline", async () => {
    const { db } = fakeDb({
      apply_due_timers: {
        data: [{ o_phase: "playing", o_start_deadline_at: "2026-11-08T01:05:00Z", o_server_now: "2026-11-08T01:05:01Z" }],
        error: null,
      },
      list_attempts: { data: [], error: null },
      list_chat: { data: [], error: null },
    });
    const feed = await getFeed(db, { id: "room", finishedAt: null, phase: "waiting", attemptCooldownSeconds: 3 }, { after: null, chatAfter: null, full: false });
    expect(feed.status).toBe("playing");
    expect(feed.startDeadlineAt).toBeNull();
    expect(feed.serverNow).toBeNull();
  });

  it("does not touch the timer when the room is already playing", async () => {
    const { db, calls } = fakeDb({ list_attempts: { data: [], error: null }, list_chat: { data: [], error: null } });
    await getFeed(db, { id: "room", finishedAt: null, phase: "playing", attemptCooldownSeconds: 3 }, { after: null, chatAfter: null, full: false });
    expect(calls).not.toContain("apply_due_timers");
  });
});
