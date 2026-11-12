import type { SupabaseClient } from "@supabase/supabase-js";
import type { FeedSnapshot, RoomStatus } from "../lib/feed-types";
import { listAttempts, listHints } from "./attempts.service";
import { listChat } from "./chat.service";
import { listPlayers, touchPlayer } from "./players.service";
import { applyDueTimers } from "./rooms.service";

/**
 * One feed payload for the polling endpoint and the first render: attempts, chat, status and, on a "full"
 * refresh, the nickname list and the hints table (which change slowly, so the browser asks every ~10 s).
 * While the room is waiting, or in turn mode, this read also applies every due timer (start of the game, skipped
 * turns): the database does it once under a room lock, however many players ask, and returns the deadlines with
 * the database clock for the countdowns. In turn mode a player's read also counts as a sign of life (presence), sent on the full refreshes only.
 */
export async function getFeed(
  db: SupabaseClient,
  room: {
    id: string;
    finishedAt: string | null;
    phase: "waiting" | "playing";
    attemptCooldownSeconds: number;
    mode: "free" | "turns";
  },
  options: { after: number | null; chatAfter: number | null; full: boolean; viewerSessionHash?: string | null },
): Promise<FeedSnapshot> {
  // Once per full refresh (~10 s): the database accepts a ping every 10 s per player and counts "away" after 30 s.
  if (room.mode === "turns" && options.full && options.viewerSessionHash) {
    await touchPlayer(db, room.id, options.viewerSessionHash);
  }
  let phase = room.phase;
  let startDeadlineAt: string | null = null;
  let serverNow: string | null = null;
  let turnNickname: string | null = null;
  let turnDeadlineAt: string | null = null;
  if ((phase === "waiting" || room.mode === "turns") && room.finishedAt === null) {
    const timers = await applyDueTimers(db, room.id);
    if (timers !== null) {
      phase = timers.phase;
      if (phase === "waiting") startDeadlineAt = timers.startDeadlineAt;
      if (phase === "waiting" || timers.turnDeadlineAt !== null) serverNow = timers.serverNow;
      turnNickname = timers.turnNickname;
      turnDeadlineAt = timers.turnDeadlineAt;
    }
  }
  const status: RoomStatus = room.finishedAt !== null ? "finished" : phase === "waiting" ? "waiting" : "playing";

  const [attemptsPage, chatPage, hints, players] = await Promise.all([
    listAttempts(db, room.id, options.after),
    listChat(db, room.id, options.chatAfter),
    options.full ? listHints(db, room.id) : Promise.resolve(null),
    options.full ? listPlayers(db, room.id, { trackPresence: room.mode === "turns" }) : Promise.resolve(null),
  ]);
  const lastAttempt = attemptsPage.attempts[attemptsPage.attempts.length - 1];
  const lastChat = chatPage.messages[chatPage.messages.length - 1];
  return {
    status,
    mode: room.mode,
    cooldownSeconds: room.attemptCooldownSeconds,
    startDeadlineAt,
    serverNow,
    turnNickname,
    turnDeadlineAt,
    attempts: attemptsPage.attempts,
    cursor: lastAttempt ? lastAttempt.id : (options.after ?? 0),
    chat: chatPage.messages,
    chatCursor: lastChat ? lastChat.id : (options.chatAfter ?? 0),
    hasMore: attemptsPage.hasMore || chatPage.hasMore,
    hints,
    players: players === null ? null : players.map((p) => p.nickname),
    awayPlayers: players === null ? null : players.filter((p) => p.away).map((p) => p.nickname),
  };
}
