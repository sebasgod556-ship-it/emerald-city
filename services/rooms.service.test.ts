import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { verifyAdminCode } from "../lib/room-secrets";
import { applyDueTimers, createRoom, findRoom, setAttemptCooldown, startRoom, verifyAdmin } from "./rooms.service";

type DbError = { code: string; message: string } | null;
type Inserted = {
  room_code: string;
  admin_code_hash: string;
  secret_pokemon_id: number;
  attempt_cooldown_seconds: number;
  phase: string;
  start_deadline_at: string | null;
};

function insertDb(errors: DbError[], inserted: Inserted[]): SupabaseClient {
  let call = 0;
  return {
    from: () => ({
      insert: async (row: Inserted) => {
        inserted.push(row);
        return { error: errors[call++] ?? null };
      },
    }),
  } as unknown as SupabaseClient;
}

function selectDb(row: unknown): SupabaseClient {
  return {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }) }),
  } as unknown as SupabaseClient;
}

describe("createRoom", () => {
  it("stores only the hash of the admin code", async () => {
    const inserted: Inserted[] = [];
    const { roomCode, adminCode } = await createRoom(insertDb([null], inserted), 25);
    expect(inserted).toHaveLength(1);
    const row = inserted[0]!;
    expect(row.room_code).toBe(roomCode);
    expect(row.secret_pokemon_id).toBe(25);
    expect(JSON.stringify(row).includes(adminCode)).toBe(false);
    expect(verifyAdminCode(roomCode, adminCode, row.admin_code_hash)).toBe(true);
  });

  it("retries with a new code when the room code is already taken", async () => {
    const inserted: Inserted[] = [];
    await createRoom(insertDb([{ code: "23505", message: "dup" }, null], inserted), 1);
    expect(inserted).toHaveLength(2);
    expect(inserted[0]!.room_code === inserted[1]!.room_code).toBe(false);
  });

  it("maps the open-room limit to ROOM_LIMIT_REACHED", async () => {
    await expect(createRoom(insertDb([{ code: "53400", message: "open room limit reached" }], []), 1)).rejects.toMatchObject({
      code: "ROOM_LIMIT_REACHED",
    });
  });

  it("maps an unknown Pokémon to VALIDATION_ERROR", async () => {
    await expect(createRoom(insertDb([{ code: "23503", message: "fk" }], []), 999999)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("hides internal database messages", async () => {
    await expect(
      createRoom(insertDb([{ code: "XX000", message: "relation rooms exploded" }], []), 1),
    ).rejects.toMatchObject({ code: "EXTERNAL_SERVICE_UNAVAILABLE", internal: "XX000: relation rooms exploded" });
    try {
      await createRoom(insertDb([{ code: "XX000", message: "relation rooms exploded" }], []), 1);
    } catch (err) {
      expect((err as Error).message.includes("exploded")).toBe(false);
    }
  });
});

describe("verifyAdmin", () => {
  it("accepts the right code and rejects wrong code, closed room and missing room", async () => {
    const inserted: Inserted[] = [];
    const { roomCode, adminCode } = await createRoom(insertDb([null], inserted), 1);
    const row = inserted[0]!;
    const dbRow = (status: string) => ({
      id: "00000000-0000-0000-0000-000000000000",
      room_code: roomCode,
      admin_code_hash: row.admin_code_hash,
      secret_pokemon_id: 1,
      status,
      created_at: "2026-11-02T00:00:00Z",
    });
    expect(await verifyAdmin(selectDb(dbRow("open")), roomCode, adminCode)).toBe(true);
    expect(await verifyAdmin(selectDb(dbRow("open")), roomCode, "ZZZZZZZZZZZZ")).toBe(false);
    expect(await verifyAdmin(selectDb(dbRow("closed")), roomCode, adminCode)).toBe(false);
    expect(await verifyAdmin(selectDb(null), roomCode, adminCode)).toBe(false);
  });
});

describe("createRoom options", () => {
  it("defaults to a 3 s wait and a 5 minute waiting room", async () => {
    const inserted: Inserted[] = [];
    const before = Date.now();
    await createRoom(insertDb([null], inserted), 25);
    const row = inserted[0]!;
    expect(row.attempt_cooldown_seconds).toBe(3);
    expect(row.phase).toBe("waiting");
    const deadline = Date.parse(row.start_deadline_at ?? "");
    expect(deadline).toBeGreaterThanOrEqual(before + 5 * 60_000);
    expect(deadline).toBeLessThanOrEqual(Date.now() + 5 * 60_000);
  });

  it("uses the admin's values", async () => {
    const inserted: Inserted[] = [];
    await createRoom(insertDb([null], inserted), 25, { cooldownSeconds: 30, waitMinutes: 10 });
    expect(inserted[0]!.attempt_cooldown_seconds).toBe(30);
    expect(Date.parse(inserted[0]!.start_deadline_at ?? "") - Date.now()).toBeGreaterThan(9 * 60_000);
  });

  it("with 0 minutes the room starts playing and has no deadline", async () => {
    const inserted: Inserted[] = [];
    await createRoom(insertDb([null], inserted), 25, { waitMinutes: 0 });
    expect(inserted[0]!.phase).toBe("playing");
    expect(inserted[0]!.start_deadline_at).toBeNull();
  });
});

describe("findRoom phase fields", () => {
  const base = {
    id: "00000000-0000-0000-0000-000000000000",
    room_code: "ABC234",
    admin_code_hash: "a".repeat(64),
    secret_pokemon_id: 1,
    status: "open",
    created_at: "2026-11-02T00:00:00Z",
  };

  it("maps the new columns", async () => {
    const room = await findRoom(
      selectDb({ ...base, attempt_cooldown_seconds: 9, phase: "waiting", start_deadline_at: "2026-11-08T01:05:00Z" }),
      "ABC234",
    );
    expect(room).toMatchObject({ attemptCooldownSeconds: 9, phase: "waiting", startDeadlineAt: "2026-11-08T01:05:00Z" });
  });

  it("treats a row without the new columns as playing with a 1 s wait", async () => {
    const room = await findRoom(selectDb(base), "ABC234");
    expect(room).toMatchObject({ attemptCooldownSeconds: 1, phase: "playing", startDeadlineAt: null });
  });
});

type RpcAnswer = { data: unknown; error: DbError };
function rpcDb(answer: RpcAnswer): { db: SupabaseClient; calls: { fn: string; args: unknown }[] } {
  const calls: { fn: string; args: unknown }[] = [];
  const db = {
    rpc: (fn: string, args: unknown) => {
      calls.push({ fn, args });
      return Promise.resolve(answer);
    },
  } as unknown as SupabaseClient;
  return { db, calls };
}

describe("startRoom / setAttemptCooldown / applyDueTimers", () => {
  it("startRoom returns whether this call started the room", async () => {
    const yes = rpcDb({ data: true, error: null });
    expect(await startRoom(yes.db, "room")).toBe(true);
    expect(yes.calls[0]).toEqual({ fn: "start_room", args: { p_room_id: "room" } });
    expect(await startRoom(rpcDb({ data: false, error: null }).db, "room")).toBe(false);
  });

  it("startRoom hides internal errors", async () => {
    await expect(startRoom(rpcDb({ data: null, error: { code: "XX000", message: "secret detail" } }).db, "room")).rejects.toMatchObject({
      code: "EXTERNAL_SERVICE_UNAVAILABLE",
      internal: "XX000: secret detail",
    });
  });

  it("setAttemptCooldown sends the seconds and maps the table constraint to VALIDATION_ERROR", async () => {
    const ok = rpcDb({ data: true, error: null });
    expect(await setAttemptCooldown(ok.db, "room", 15)).toBe(true);
    expect(ok.calls[0]).toEqual({ fn: "set_attempt_cooldown", args: { p_room_id: "room", p_seconds: 15 } });
    await expect(setAttemptCooldown(rpcDb({ data: null, error: { code: "23514", message: "check" } }).db, "room", 500)).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("applyDueTimers returns the phase and the database clock, or null when there is no room", async () => {
    const found = rpcDb({
      data: [{ o_phase: "waiting", o_start_deadline_at: "2026-11-08T01:05:00Z", o_server_now: "2026-11-08T01:00:00Z" }],
      error: null,
    });
    expect(await applyDueTimers(found.db, "room")).toEqual({
      phase: "waiting",
      startDeadlineAt: "2026-11-08T01:05:00Z",
      serverNow: "2026-11-08T01:00:00Z",
    });
    expect(await applyDueTimers(rpcDb({ data: [], error: null }).db, "room")).toBeNull();
    await expect(applyDueTimers(rpcDb({ data: null, error: { code: "XX000", message: "boom" } }).db, "room")).rejects.toMatchObject({
      code: "EXTERNAL_SERVICE_UNAVAILABLE",
    });
  });
});
