import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { AppError } from "../lib/result";
import { FEED_PAGE_LIMIT, getFeed, listAttempts, submitAttempt } from "./attempts.service";

type RpcResult = { data: unknown; error: { code: string; message: string } | null };

/** Stand-in for db.rpc(): records the call and answers by function name. */
function fakeRpc(answers: Record<string, RpcResult>) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const db = {
    rpc: (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      return Promise.resolve(answers[fn] ?? { data: null, error: { code: "42883", message: "missing" } });
    },
  } as unknown as SupabaseClient;
  return { db, calls };
}

async function errorOf(promise: Promise<unknown>): Promise<AppError> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof AppError) return err;
    throw err;
  }
  throw new Error("expected the promise to reject");
}

const row = (outcome: string, result: string | null = null, winner: boolean | null = null) => ({
  data: [{ o_outcome: outcome, o_result: result, o_is_winner: winner }],
  error: null,
});

describe("submitAttempt", () => {
  it("returns the icon name and winner flag", async () => {
    const { db, calls } = fakeRpc({ submit_attempt: row("ok", "warm", false) });
    await expect(submitAttempt(db, "room", "hash", 7)).resolves.toEqual({ result: "warm", isWinner: false });
    expect(calls[0]).toEqual({
      fn: "submit_attempt",
      args: { p_room_id: "room", p_session_hash: "hash", p_pokemon_id: 7 },
    });
  });

  it("returns a win", async () => {
    const { db } = fakeRpc({ submit_attempt: row("ok", "fire", true) });
    await expect(submitAttempt(db, "r", "h", 1)).resolves.toEqual({ result: "fire", isWinner: true });
  });

  it.each([
    ["unknown_room", "NOT_FOUND"],
    ["room_closed", "ROOM_CLOSED"],
    ["round_finished", "ROUND_FINISHED"],
    ["not_player", "UNAUTHENTICATED"],
    ["unknown_pokemon", "VALIDATION_ERROR"],
    ["cooldown", "RATE_LIMITED"],
  ])("maps outcome %s to %s", async (outcome, code) => {
    const { db } = fakeRpc({ submit_attempt: row(outcome) });
    expect((await errorOf(submitAttempt(db, "r", "h", 1))).code).toBe(code);
  });

  it("puts retryAfter in the details of a cooldown", async () => {
    const { db } = fakeRpc({ submit_attempt: row("cooldown") });
    expect((await errorOf(submitAttempt(db, "r", "h", 1))).details).toEqual({ retryAfter: 1 });
  });

  it("hides database errors behind EXTERNAL_SERVICE_UNAVAILABLE", async () => {
    const { db } = fakeRpc({ submit_attempt: { data: null, error: { code: "XX000", message: "secret internals" } } });
    const err = await errorOf(submitAttempt(db, "r", "h", 1));
    expect(err.code).toBe("EXTERNAL_SERVICE_UNAVAILABLE");
    expect(err.message).not.toContain("secret internals");
  });

  it("treats an unexpected response shape as unavailable", async () => {
    const { db } = fakeRpc({ submit_attempt: { data: [{ nope: 1 }], error: null } });
    expect((await errorOf(submitAttempt(db, "r", "h", 1))).code).toBe("EXTERNAL_SERVICE_UNAVAILABLE");
  });
});

const feedRow = (id: number) => ({
  o_id: id,
  o_nickname: "Ana",
  o_pokemon: "Pikachu",
  o_result: "cold",
  o_is_winner: false,
});

describe("listAttempts", () => {
  it("asks for the latest page without a cursor and never reports more", async () => {
    const { db, calls } = fakeRpc({ list_attempts: { data: [feedRow(1), feedRow(2)], error: null } });
    const out = await listAttempts(db, "room", null);
    expect(out.attempts.map((a) => a.id)).toEqual([1, 2]);
    expect(out.hasMore).toBe(false);
    expect(calls[0]?.args.p_after).toBeNull();
  });

  it("reports hasMore and trims the extra row when a full page waits", async () => {
    const rows = Array.from({ length: FEED_PAGE_LIMIT + 1 }, (_, i) => feedRow(i + 11));
    const { db, calls } = fakeRpc({ list_attempts: { data: rows, error: null } });
    const out = await listAttempts(db, "room", 10);
    expect(out.hasMore).toBe(true);
    expect(out.attempts).toHaveLength(FEED_PAGE_LIMIT);
    expect(calls[0]?.args.p_limit).toBe(FEED_PAGE_LIMIT + 1);
  });

  it("maps database failures to EXTERNAL_SERVICE_UNAVAILABLE", async () => {
    const { db } = fakeRpc({ list_attempts: { data: null, error: { code: "XX000", message: "boom" } } });
    expect((await errorOf(listAttempts(db, "room", null))).code).toBe("EXTERNAL_SERVICE_UNAVAILABLE");
  });
});

describe("getFeed", () => {
  it("keeps the caller's cursor when nothing is new and marks a finished room", async () => {
    const { db } = fakeRpc({ list_attempts: { data: [], error: null } });
    const feed = await getFeed(db, { id: "room", finishedAt: "2026-11-05T00:00:00Z" }, { after: 42, withPlayers: false });
    expect(feed).toEqual({ status: "finished", attempts: [], cursor: 42, hasMore: false, players: null });
  });

  it("uses the last attempt id as the cursor", async () => {
    const { db } = fakeRpc({ list_attempts: { data: [feedRow(5), feedRow(9)], error: null } });
    const feed = await getFeed(db, { id: "room", finishedAt: null }, { after: null, withPlayers: false });
    expect(feed.cursor).toBe(9);
    expect(feed.status).toBe("playing");
  });
});
