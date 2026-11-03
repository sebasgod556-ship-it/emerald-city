import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { verifyAdminCode } from "../lib/room-secrets";
import { createRoom, verifyAdmin } from "./rooms.service";

type DbError = { code: string; message: string } | null;
type Inserted = { room_code: string; admin_code_hash: string; secret_pokemon_id: number };

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
