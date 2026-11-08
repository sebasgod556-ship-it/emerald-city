import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { AppError } from "../lib/result";
import { CHAT_PAGE_LIMIT, listChat, postAdminChatMessage, postChatMessage } from "./chat.service";

type Answer = { data: unknown; error: { code: string; message: string } | null };

function fakeRpc(answer: Answer) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const db = {
    rpc: (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      return Promise.resolve(answer);
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

const post = (outcome: string, id: number | null = null): Answer => ({ data: [{ o_outcome: outcome, o_id: id }], error: null });

describe("postChatMessage", () => {
  it("returns the new message id", async () => {
    const { db, calls } = fakeRpc(post("ok", 12));
    await expect(postChatMessage(db, "room", "hash", "hola")).resolves.toBe(12);
    expect(calls[0]).toEqual({ fn: "post_chat_message", args: { p_room_id: "room", p_session_hash: "hash", p_body: "hola" } });
  });

  it("uses the admin function for the admin", async () => {
    const { db, calls } = fakeRpc(post("ok", 3));
    await expect(postAdminChatMessage(db, "room", "bienvenidos")).resolves.toBe(3);
    expect(calls[0]?.fn).toBe("post_admin_chat_message");
  });

  it.each([
    ["unknown_room", "NOT_FOUND"],
    ["room_closed", "ROOM_CLOSED"],
    ["not_player", "UNAUTHENTICATED"],
    ["invalid", "VALIDATION_ERROR"],
    ["rate_limited", "RATE_LIMITED"],
  ])("maps outcome %s to %s", async (outcome, code) => {
    const { db } = fakeRpc(post(outcome));
    expect((await errorOf(postChatMessage(db, "r", "h", "x"))).code).toBe(code);
  });

  it("hides database errors", async () => {
    const { db } = fakeRpc({ data: null, error: { code: "XX000", message: "secret internals" } });
    const err = await errorOf(postChatMessage(db, "r", "h", "x"));
    expect(err.code).toBe("EXTERNAL_SERVICE_UNAVAILABLE");
    expect(err.message).not.toContain("secret internals");
  });
});

const row = (id: number) => ({ o_id: id, o_nickname: "Ana", o_body: "hola", o_is_admin: false });

describe("listChat", () => {
  it("returns the latest page without a cursor", async () => {
    const { db, calls } = fakeRpc({ data: [row(1), row(2)], error: null });
    const out = await listChat(db, "room", null);
    expect(out.messages.map((m) => m.id)).toEqual([1, 2]);
    expect(out.hasMore).toBe(false);
    expect(calls[0]?.args.p_after).toBeNull();
  });

  it("reports hasMore and trims the extra row", async () => {
    const rows = Array.from({ length: CHAT_PAGE_LIMIT + 1 }, (_, i) => row(i + 11));
    const { db } = fakeRpc({ data: rows, error: null });
    const out = await listChat(db, "room", 10);
    expect(out.hasMore).toBe(true);
    expect(out.messages).toHaveLength(CHAT_PAGE_LIMIT);
  });
});
