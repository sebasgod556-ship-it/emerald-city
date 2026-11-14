// Types shared by server and client for the room feed (attempts + players). No runtime imports on purpose.
export type HintResult = "fire" | "warm" | "cold";

export type FeedAttempt = {
  id: number;
  nickname: string;
  /** Pokémon name only. Types and generation never leave the database. */
  pokemon: string;
  result: HintResult;
  isWinner: boolean;
};

export type HintEntry = { pokemon: string; result: "fire" | "warm" };

export type ChatMessage = { id: number; nickname: string; body: string; isAdmin: boolean };

/** An automatic clue the room revealed: one type of the secret, or its generation number. */
export type Clue = { kind: "type" | "generation"; value: string };

/** waiting = lobby, playing = attempts accepted, paused = the admin paused the game, finished = somebody guessed the secret. */
export type RoomStatus = "waiting" | "playing" | "paused" | "finished";

export type FeedSnapshot = {
  status: RoomStatus;
  /** free = everybody sends at once; turns = one player at a time. */
  mode: "free" | "turns";
  /** Seconds a player waits between two attempts (chosen by the admin; can change while playing). */
  cooldownSeconds: number;
  /** UTC instant when the waiting room starts by itself. Only sent while status is "waiting". */
  startDeadlineAt: string | null;
  /** Database clock at the moment of the read. Sent while "waiting" and while a turn is running: the countdowns use it, not the phone's clock. */
  serverNow: string | null;
  /** Turn mode, game running: nickname of the player who has the turn, and when the turn is skipped (UTC). */
  turnNickname: string | null;
  turnDeadlineAt: string | null;
  attempts: FeedAttempt[];
  /** Id of the last attempt the caller has seen. Send it back as ?after= to get only newer ones. */
  cursor: number;
  /** Chat messages, oldest first, with their own cursor. */
  chat: ChatMessage[];
  chatCursor: number;
  /** True when more attempts or chat messages than one page are waiting: ask again right away. */
  hasMore: boolean;
  /** Every non-cold Pokémon tried in the room (side table). Only sent with ?players=1 (full refresh). */
  hints: HintEntry[] | null;
  /** Nicknames in order of arrival, or null when the caller did not ask for the full refresh (?players=1). */
  players: string[] | null;
  /** Nicknames of players who look disconnected (turn mode only). Sent together with players. */
  awayPlayers: string[] | null;
  /** Round number of the room (+1 on every reset). A new number means: clear attempts, chat, hints and clues. */
  round: number;
  /** Automatic clues revealed so far. Null when this read did not ask the database for them (finished room): keep the ones you have. */
  clues: Clue[] | null;
  /** Nicknames the admin muted. Only sent to the admin, together with players; null for everybody else. */
  mutedPlayers: string[] | null;
};

export const HINT_META: Record<HintResult, { icon: string; label: string }> = {
  fire: { icon: "🔥", label: "Fuego" },
  warm: { icon: "🌡️", label: "Tibio" },
  cold: { icon: "❄️", label: "Hielo" },
};
