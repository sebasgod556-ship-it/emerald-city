import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { AppError } from "../lib/result";
import { addPlayer, findPlayerBySession, listPlayers, MAX_PLAYERS_PER_ROOM } from "./players.service";

type DbResult = { data: unknown; error: { code: string; message: string; details?: string | null } | null };

type Query = {
  select: () => Query;
  eq: () => Query;
  order: () => Query;
  limit: () => Query;
  insert: () => Promise<DbResult>;
  maybeSingle: () => Promise<DbResult>;
  then: (onFulfilled: (value: DbResult) => unknown, onRejected?: (reason: unknown) => unknown) => Promise<unknown>;
};

/** Minimal stand-in for the Supabase query builder: every call chains, the end resolves to `result`. */
function fakeDb(result: DbResult): SupabaseClient {
  const query: Query = {
    select: () => query,
    eq: () => query,
    order: () => query,
    limit: () => query,
    insert: () => Promise.resolve(result),
    maybeSingle: () => Promise.resolve(result),
    then: (onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected),
  };
  return { from: () => query } as unknown as SupabaseClient;
}

const HASH = "a".repeat(64);

async function errorOf(promise: Promise<unknown>): Promise<AppError> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof AppError) return err;
    throw err;
  }
  throw new Error("expected the promise to reject");
}

describe("addPlayer", () => {
  it("returns the nickname on success", async () => {
    await expect(addPlayer(fakeDb({ data: null, error: null }), "room-1", "Ana", HASH)).resolves.toEqual({
      nickname: "Ana",
    });
  });

  it("maps a duplicate nickname to NICKNAME_TAKEN with the friendly message", async () => {
    const db = fakeDb({
      data: null,
      error: { code: "23505", message: 'duplicate key value violates unique constraint "players_room_nickname_key"' },
    });
    const err = await errorOf(addPlayer(db, "room-1", "Ana", HASH));
    expect(err.code).toBe("NICKNAME_TAKEN");
    expect(err.message).toBe("Ese apodo ya está en uso, agrega una letra o un número.");
    expect(err.internal).toBeUndefined();
  });

  it("maps a full room, a closed room and a missing room", async () => {
    const full = await errorOf(addPlayer(fakeDb({ data: null, error: { code: "53400", message: "room full" } }), "r", "Ana", HASH));
    expect(full.code).toBe("ROOM_FULL");
    const closed = await errorOf(addPlayer(fakeDb({ data: null, error: { code: "P0001", message: "room closed" } }), "r", "Ana", HASH));
    expect(closed.code).toBe("ROOM_CLOSED");
    const missing = await errorOf(addPlayer(fakeDb({ data: null, error: { code: "23503", message: "fk" } }), "r", "Ana", HASH));
    expect(missing.code).toBe("NOT_FOUND");
  });

  it("maps a check violation to VALIDATION_ERROR", async () => {
    const err = await errorOf(addPlayer(fakeDb({ data: null, error: { code: "23514", message: "check" } }), "r", "A", HASH));
    expect(err.code).toBe("VALIDATION_ERROR");
  });

  it("hides unknown database errors: safe message out, original kept only in `internal`", async () => {
    const err = await errorOf(
      addPlayer(fakeDb({ data: null, error: { code: "XX000", message: "secret postgres detail" } }), "r", "Ana", HASH),
    );
    expect(err.code).toBe("EXTERNAL_SERVICE_UNAVAILABLE");
    expect(err.message).not.toContain("postgres");
    expect(err.internal).toBe("XX000: secret postgres detail");
  });

  it("does not treat a different unique violation as a taken nickname", async () => {
    const db = fakeDb({
      data: null,
      error: { code: "23505", message: 'duplicate key value violates unique constraint "players_room_session_key"' },
    });
    expect((await errorOf(addPlayer(db, "r", "Ana", HASH))).code).toBe("CONFLICT");
  });
});

describe("findPlayerBySession", () => {
  it("returns the player when found", async () => {
    const db = fakeDb({ data: { nickname: "Ana" }, error: null });
    await expect(findPlayerBySession(db, "room-1", HASH)).resolves.toEqual({ nickname: "Ana" });
  });

  it("returns null when there is no such session", async () => {
    await expect(findPlayerBySession(fakeDb({ data: null, error: null }), "room-1", HASH)).resolves.toBeNull();
  });

  it("throws EXTERNAL_SERVICE_UNAVAILABLE when the database fails", async () => {
    const db = fakeDb({ data: null, error: { code: "08006", message: "connection failure" } });
    expect((await errorOf(findPlayerBySession(db, "room-1", HASH))).code).toBe("EXTERNAL_SERVICE_UNAVAILABLE");
  });
});

describe("listPlayers", () => {
  it("returns nicknames only, in the order given", async () => {
    const db = fakeDb({ data: [{ nickname: "Ana" }, { nickname: "Luis" }], error: null });
    await expect(listPlayers(db, "room-1")).resolves.toEqual([{ nickname: "Ana" }, { nickname: "Luis" }]);
  });

  it("never leaks extra columns such as the session hash", async () => {
    const db = fakeDb({ data: [{ nickname: "Ana", session_hash: HASH }], error: null });
    const players = await listPlayers(db, "room-1");
    expect(players).toEqual([{ nickname: "Ana" }]);
    expect(JSON.stringify(players)).not.toContain(HASH);
  });

  it("returns an empty list when there are no players", async () => {
    await expect(listPlayers(fakeDb({ data: [], error: null }), "room-1")).resolves.toEqual([]);
  });

  it("throws EXTERNAL_SERVICE_UNAVAILABLE when the database fails", async () => {
    const db = fakeDb({ data: null, error: { code: "08006", message: "connection failure" } });
    expect((await errorOf(listPlayers(db, "room-1"))).code).toBe("EXTERNAL_SERVICE_UNAVAILABLE");
  });
});

describe("constants", () => {
  it("keeps the cap in sync with the database trigger (100)", () => {
    expect(MAX_PLAYERS_PER_ROOM).toBe(100);
  });
});
