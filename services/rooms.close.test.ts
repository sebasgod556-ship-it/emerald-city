import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { AppError } from "../lib/result";
import { closeRoomInputSchema } from "../lib/validation/rooms";
import { closeRoom } from "./rooms.service";

function fakeRpc(answer: { data: unknown; error: { code: string; message: string } | null }) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const db = {
    rpc: (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      return Promise.resolve(answer);
    },
  } as unknown as SupabaseClient;
  return { db, calls };
}

describe("closeRoom", () => {
  it("returns true when the database closed the room", async () => {
    const { db, calls } = fakeRpc({ data: true, error: null });
    await expect(closeRoom(db, "room-1")).resolves.toBe(true);
    expect(calls[0]).toEqual({ fn: "close_room", args: { p_room_id: "room-1" } });
  });

  it("returns false when the room was already closed", async () => {
    const { db } = fakeRpc({ data: false, error: null });
    await expect(closeRoom(db, "room-1")).resolves.toBe(false);
  });

  it("hides database errors behind EXTERNAL_SERVICE_UNAVAILABLE", async () => {
    const { db } = fakeRpc({ data: null, error: { code: "XX000", message: "secret internals" } });
    let caught: unknown;
    try {
      await closeRoom(db, "room-1");
    } catch (err) {
      caught = err;
    }
    expect(caught instanceof AppError).toBe(true);
    expect((caught as AppError).code).toBe("EXTERNAL_SERVICE_UNAVAILABLE");
    expect((caught as AppError).message).not.toContain("secret internals");
  });

  it("treats an unexpected response as unavailable", async () => {
    const { db } = fakeRpc({ data: "yes", error: null });
    let code = "";
    try {
      await closeRoom(db, "room-1");
    } catch (err) {
      code = (err as AppError).code;
    }
    expect(code).toBe("EXTERNAL_SERVICE_UNAVAILABLE");
  });
});

describe("closeRoomInputSchema", () => {
  it("accepts a room code and normalizes it", () => {
    const parsed = closeRoomInputSchema.safeParse({ roomCode: "abcdef" });
    expect(parsed.success).toBe(true);
  });
  it("rejects a bad code", () => {
    expect(closeRoomInputSchema.safeParse({ roomCode: "x" }).success).toBe(false);
    expect(closeRoomInputSchema.safeParse({}).success).toBe(false);
  });
});
