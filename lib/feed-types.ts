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

export type FeedSnapshot = {
  status: "playing" | "finished";
  attempts: FeedAttempt[];
  /** Id of the last attempt the caller has seen. Send it back as ?after= to get only newer ones. */
  cursor: number;
  /** True when more attempts than one page are waiting: ask again right away. */
  hasMore: boolean;
  /** Nicknames in order of arrival, or null when the caller did not ask for them (?players=1). */
  players: string[] | null;
};

export const HINT_META: Record<HintResult, { icon: string; label: string }> = {
  fire: { icon: "🔥", label: "Fuego" },
  warm: { icon: "🌡️", label: "Tibio" },
  cold: { icon: "❄️", label: "Hielo" },
};
