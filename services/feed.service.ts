import type { SupabaseClient } from "@supabase/supabase-js";
import type { FeedSnapshot, RoomStatus } from "../lib/feed-types";
import { listAttempts, listHints } from "./attempts.service";
import { listChat } from "./chat.service";
import { listPlayers } from "./players.service";
import { applyDueTimers } from "./rooms.service";

/**
 * One feed payload for the polling endpoint and the first render: attempts, chat, status and, on a "full"
 * refresh, the nickname list and the hints table (which change slowly, so the browser asks every ~10 s).
 * While the room is waiting, this read also applies the start timer if it is due (the database does it once,
 * however many players ask) and returns the deadline with the database clock for the countdown.
 */
export async function getFeed(
  db: SupabaseClient,
  room: { id: string; finishedAt: string | null; phase: "waiting" | "playing"; attemptCooldownSeconds: number },
  options: { after: number | null; chatAfter: number | null; full: boolean },
): Promise<FeedSnapshot> {
  let phase = room.phase;
  let startDeadlineAt: string | null = null;
  let serverNow: string | null = null;
  if (phase === "waiting" && room.finishedAt === null) {
    const timers = await applyDueTimers(db, room.id);
    if (timers !== null) {
      phase = timers.phase;
      if (phase === "waiting") {
        startDeadlineAt = timers.startDeadlineAt;
        serverNow = timers.serverNow;
      }
    }
  }
  const status: RoomStatus = room.finishedAt !== null ? "finished" : phase === "waiting" ? "waiting" : "playing";

  const [attemptsPage, chatPage, hints, players] = await Promise.all([
    listAttempts(db, room.id, options.after),
    listChat(db, room.id, options.chatAfter),
    options.full ? listHints(db, room.id) : Promise.resolve(null),
    options.full ? listPlayers(db, room.id) : Promise.resolve(null),
  ]);
  const lastAttempt = attemptsPage.attempts[attemptsPage.attempts.length - 1];
  const lastChat = chatPage.messages[chatPage.messages.length - 1];
  return {
    status,
    cooldownSeconds: room.attemptCooldownSeconds,
    startDeadlineAt,
    serverNow,
    attempts: attemptsPage.attempts,
    cursor: lastAttempt ? lastAttempt.id : (options.after ?? 0),
    chat: chatPage.messages,
    chatCursor: lastChat ? lastChat.id : (options.chatAfter ?? 0),
    hasMore: attemptsPage.hasMore || chatPage.hasMore,
    hints,
    players: players === null ? null : players.map((p) => p.nickname),
  };
}
