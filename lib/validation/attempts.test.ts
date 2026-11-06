import { describe, expect, it } from "vitest";
import { parseFeedQuery, submitAttemptInputSchema } from "./attempts";

describe("submitAttemptInputSchema", () => {
  it("accepts a room code and a Pokémon id", () => {
    expect(submitAttemptInputSchema.safeParse({ roomCode: "ABCDEF", pokemonId: 25 }).success).toBe(true);
  });
  it.each([
    { roomCode: "ABCDEF", pokemonId: 0 },
    { roomCode: "ABCDEF", pokemonId: 1.5 },
    { roomCode: "ABCDEF", pokemonId: "25" },
    { roomCode: "abc", pokemonId: 25 },
    {},
  ])("rejects %j", (input) => {
    expect(submitAttemptInputSchema.safeParse(input).success).toBe(false);
  });
});

describe("parseFeedQuery", () => {
  it("defaults to no cursor and no players", () => {
    expect(parseFeedQuery(new URLSearchParams())).toEqual({ after: null, withPlayers: false });
  });
  it("reads after and players", () => {
    expect(parseFeedQuery(new URLSearchParams("after=12&players=1"))).toEqual({ after: 12, withPlayers: true });
    expect(parseFeedQuery(new URLSearchParams("after=0"))).toEqual({ after: 0, withPlayers: false });
  });
  it.each(["after=-1", "after=abc", "after=1.5", "after=1234567890123456", "players=yes"])("rejects %s", (q) => {
    expect(parseFeedQuery(new URLSearchParams(q))).toBeNull();
  });
});
