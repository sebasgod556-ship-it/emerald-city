import { describe, expect, it } from "vitest";
import { parseFeed, parseNames } from "./feed-parse";

const attempt = { id: 3, nickname: "Ana", pokemon: "Mew", result: "warm", isWinner: false };
const body = (data: unknown) => ({ data, error: null });
const base = { status: "playing", attempts: [] as unknown[], cursor: 0, chat: [] as unknown[], chatCursor: 0, hasMore: false };

describe("parseFeed", () => {
  it("accepts a valid feed", () => {
    const feed = parseFeed(body({ ...base, attempts: [attempt], cursor: 3, players: ["Ana"] }));
    expect(feed?.attempts[0]?.pokemon).toBe("Mew");
    expect(feed?.players).toEqual(["Ana"]);
  });

  it("treats missing players as null", () => {
    expect(parseFeed(body({ ...base, status: "finished" }))?.players).toBeNull();
  });

  it.each([
    ["error body", { data: null, error: { code: "X" } }],
    ["bad status", body({ ...base, status: "x" })],
    ["bad result", body({ ...base, attempts: [{ ...attempt, result: "hot" }], cursor: 3 })],
    ["bad cursor", body({ ...base, cursor: "3" })],
    ["bad players", body({ ...base, players: [1] })],
    ["missing chat", body({ status: "playing", attempts: [], cursor: 0, hasMore: false })],
    ["bad chat message", body({ ...base, chat: [{ id: 1, nickname: "A", body: 5, isAdmin: false }] })],
    ["bad hint", body({ ...base, hints: [{ pokemon: "Mew", result: "cold" }] })],
  ])("rejects %s", (_name, input) => {
    expect(parseFeed(input)).toBeNull();
  });
});

describe("parseFeed chat and hints", () => {
  it("parses chat messages and hints", () => {
    const feed = parseFeed(
      body({
        ...base,
        chat: [{ id: 4, nickname: "Beto", body: "hola", isAdmin: false }],
        chatCursor: 4,
        hints: [{ pokemon: "Ivysaur", result: "fire" }],
      }),
    );
    expect(feed?.chat[0]?.body).toBe("hola");
    expect(feed?.chatCursor).toBe(4);
    expect(feed?.hints).toEqual([{ pokemon: "Ivysaur", result: "fire" }]);
  });
  it("treats missing hints as null", () => {
    expect(parseFeed(body(base))?.hints).toBeNull();
  });
});

describe("parseNames", () => {
  it("accepts names and rejects malformed rows", () => {
    expect(parseNames(body({ names: [{ id: 1, nombre_es: "Bulbasaur", search_key: "bulbasaur" }] }))).toHaveLength(1);
    expect(parseNames(body({ names: [{ id: "1", nombre_es: "x", search_key: "x" }] }))).toBeNull();
    expect(parseNames(body({}))).toBeNull();
  });
});

describe("parseFeed waiting room fields", () => {
  it("accepts a waiting room with its deadline and server clock", () => {
    const feed = parseFeed(
      body({ ...base, status: "waiting", cooldownSeconds: 5, startDeadlineAt: "2026-11-08T01:05:00Z", serverNow: "2026-11-08T01:00:00Z" }),
    );
    expect(feed).toMatchObject({ status: "waiting", cooldownSeconds: 5, startDeadlineAt: "2026-11-08T01:05:00Z", serverNow: "2026-11-08T01:00:00Z" });
  });

  it("defaults the new fields when an older server leaves them out", () => {
    expect(parseFeed(body(base))).toMatchObject({ cooldownSeconds: 1, startDeadlineAt: null, serverNow: null });
  });

  it.each([
    ["cooldown as text", { cooldownSeconds: "5" }],
    ["deadline as number", { startDeadlineAt: 5 }],
    ["server clock as number", { serverNow: 5 }],
  ])("rejects %s", (_name, extra) => {
    expect(parseFeed(body({ ...base, ...extra }))).toBeNull();
  });
});
