import { describe, expect, it } from "vitest";
import { parseFeed, parseNames } from "./feed-parse";

const attempt = { id: 3, nickname: "Ana", pokemon: "Mew", result: "warm", isWinner: false };
const body = (data: unknown) => ({ data, error: null });

describe("parseFeed", () => {
  it("accepts a valid feed", () => {
    const feed = parseFeed(body({ status: "playing", attempts: [attempt], cursor: 3, hasMore: false, players: ["Ana"] }));
    expect(feed?.attempts[0]?.pokemon).toBe("Mew");
    expect(feed?.players).toEqual(["Ana"]);
  });

  it("treats missing players as null", () => {
    expect(parseFeed(body({ status: "finished", attempts: [], cursor: 0, hasMore: false }))?.players).toBeNull();
  });

  it.each([
    ["error body", { data: null, error: { code: "X" } }],
    ["bad status", body({ status: "x", attempts: [], cursor: 0, hasMore: false })],
    ["bad result", body({ status: "playing", attempts: [{ ...attempt, result: "hot" }], cursor: 3, hasMore: false })],
    ["bad cursor", body({ status: "playing", attempts: [], cursor: "3", hasMore: false })],
    ["bad players", body({ status: "playing", attempts: [], cursor: 0, hasMore: false, players: [1] })],
  ])("rejects %s", (_name, input) => {
    expect(parseFeed(input)).toBeNull();
  });
});

describe("parseNames", () => {
  it("accepts names and rejects malformed rows", () => {
    expect(parseNames(body({ names: [{ id: 1, nombre_es: "Bulbasaur", search_key: "bulbasaur" }] }))).toHaveLength(1);
    expect(parseNames(body({ names: [{ id: "1", nombre_es: "x", search_key: "x" }] }))).toBeNull();
    expect(parseNames(body({}))).toBeNull();
  });
});
