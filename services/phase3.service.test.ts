import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { parseFeed } from "../lib/feed-parse";
import {
  clueMaxSchema,
  clueIntervalSecondsSchema,
  createRoomInputSchema,
  mutePlayerInputSchema,
  resetRoomInputSchema,
  updateClueSettingsInputSchema,
} from "../lib/validation/rooms";
import { AppError } from "../lib/result";
import { submitAttempt } from "./attempts.service";
import { postChatMessage } from "./chat.service";
import { getFeed } from "./feed.service";
import { setPlayerMuted } from "./players.service";
import { applyDueTimers, createRoom, pauseRoom, resetRoom, resumeRoom, setClueSettings, skipTurn } from "./rooms.service";

type Answer = { data: unknown; error: { code: string; message: string } | null };

function rpcDb(answers: Record<string, Answer>, players: unknown[] = []) {
  const calls: { fn: string; args: unknown }[] = [];
  const db = {
    rpc: (fn: string, args: unknown) => {
      calls.push({ fn, args });
      return Promise.resolve(answers[fn] ?? { data: null, error: { code: "42883", message: "missing" } });
    },
    from: () => ({
      select: () => ({
        eq: () => ({ is: () => ({ order: () => ({ limit: () => Promise.resolve({ data: players, error: null }) }) }) }),
      }),
    }),
  } as unknown as SupabaseClient;
  return { db, calls };
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (err) {
    return err instanceof AppError ? err.code : "OTHER";
  }
  return "NO_ERROR";
}

const room = { id: "room", finishedAt: null, attemptCooldownSeconds: 3, roundNo: 1 };
const empty = { list_attempts: { data: [], error: null }, list_chat: { data: [], error: null } };

describe("validation (phase 3)", () => {
  it("clue limits: 0 to 5 clues, every 15 to 300 seconds", () => {
    expect(clueMaxSchema.safeParse(0).success).toBe(true);
    expect(clueMaxSchema.safeParse(5).success).toBe(true);
    expect(clueMaxSchema.safeParse(6).success).toBe(false);
    expect(clueMaxSchema.safeParse(-1).success).toBe(false);
    expect(clueIntervalSecondsSchema.safeParse(15).success).toBe(true);
    expect(clueIntervalSecondsSchema.safeParse(300).success).toBe(true);
    expect(clueIntervalSecondsSchema.safeParse(14).success).toBe(false);
    expect(clueIntervalSecondsSchema.safeParse(301).success).toBe(false);
    expect(clueIntervalSecondsSchema.safeParse(60.5).success).toBe(false);
  });

  it("createRoom input defaults to 2 clues every 60 s", () => {
    const parsed = createRoomInputSchema.parse({ pokemonId: 25 });
    expect(parsed).toMatchObject({ clueMax: 2, clueIntervalSeconds: 60 });
    expect(createRoomInputSchema.safeParse({ pokemonId: 25, clueMax: 9 }).success).toBe(false);
  });

  it("admin power inputs", () => {
    expect(mutePlayerInputSchema.safeParse({ roomCode: "ABC234", nickname: "Ana", muted: true }).success).toBe(true);
    expect(mutePlayerInputSchema.safeParse({ roomCode: "ABC234", nickname: "Ana" }).success).toBe(false);
    expect(updateClueSettingsInputSchema.safeParse({ roomCode: "ABC234", intervalSeconds: 30, max: 3 }).success).toBe(true);
    expect(updateClueSettingsInputSchema.safeParse({ roomCode: "ABC234", intervalSeconds: 5, max: 3 }).success).toBe(false);
    expect(resetRoomInputSchema.safeParse({ roomCode: "ABC234", pokemonId: 0 }).success).toBe(false);
    expect(resetRoomInputSchema.safeParse({ roomCode: "ABC234", pokemonId: 150 }).success).toBe(true);
  });
});

describe("createRoom clue settings", () => {
  it("stores the clue options chosen by the admin", async () => {
    const inserted: Record<string, unknown>[] = [];
    const db = {
      from: () => ({
        insert: async (row: Record<string, unknown>) => {
          inserted.push(row);
          return { error: null };
        },
      }),
    } as unknown as SupabaseClient;
    await createRoom(db, 25, { clueMax: 4, clueIntervalSeconds: 90 });
    expect(inserted[0]).toMatchObject({ clue_max: 4, clue_interval_seconds: 90 });
    await createRoom(db, 25);
    expect(inserted[1]).toMatchObject({ clue_max: 2, clue_interval_seconds: 60 });
  });
});

describe("admin power services", () => {
  it("pauseRoom: ok, repeated pause is harmless, closed and not-playing are mapped", async () => {
    await expect(pauseRoom(rpcDb({ pause_room: { data: "ok", error: null } }).db, "r")).resolves.toBeUndefined();
    await expect(pauseRoom(rpcDb({ pause_room: { data: "already_paused", error: null } }).db, "r")).resolves.toBeUndefined();
    expect(await codeOf(pauseRoom(rpcDb({ pause_room: { data: "room_closed", error: null } }).db, "r"))).toBe("ROOM_CLOSED");
    expect(await codeOf(pauseRoom(rpcDb({ pause_room: { data: "not_playing", error: null } }).db, "r"))).toBe("CONFLICT");
    expect(await codeOf(pauseRoom(rpcDb({ pause_room: { data: null, error: { code: "XX", message: "boom" } } }).db, "r"))).toBe(
      "EXTERNAL_SERVICE_UNAVAILABLE",
    );
  });

  it("resumeRoom and skipTurn map their outcomes", async () => {
    await expect(resumeRoom(rpcDb({ resume_room: { data: "not_paused", error: null } }).db, "r")).resolves.toBeUndefined();
    expect(await codeOf(resumeRoom(rpcDb({ resume_room: { data: "room_closed", error: null } }).db, "r"))).toBe("ROOM_CLOSED");
    await expect(skipTurn(rpcDb({ skip_turn: { data: "ok", error: null } }).db, "r")).resolves.toBeUndefined();
    expect(await codeOf(skipTurn(rpcDb({ skip_turn: { data: "not_available", error: null } }).db, "r"))).toBe("CONFLICT");
  });

  it("setClueSettings sends the right arguments and maps a constraint failure to VALIDATION_ERROR", async () => {
    const ok = rpcDb({ set_clue_settings: { data: true, error: null } });
    expect(await setClueSettings(ok.db, "r", 45, 3)).toBe(true);
    expect(ok.calls[0]).toEqual({ fn: "set_clue_settings", args: { p_room_id: "r", p_interval_seconds: 45, p_max: 3 } });
    const bad = rpcDb({ set_clue_settings: { data: null, error: { code: "23514", message: "check" } } });
    expect(await codeOf(setClueSettings(bad.db, "r", 5, 3))).toBe("VALIDATION_ERROR");
  });

  it("resetRoom maps its outcomes and never leaks the database message", async () => {
    await expect(resetRoom(rpcDb({ reset_room: { data: "ok", error: null } }).db, "r", 25)).resolves.toBeUndefined();
    expect(await codeOf(resetRoom(rpcDb({ reset_room: { data: "unknown_pokemon", error: null } }).db, "r", 99999))).toBe("VALIDATION_ERROR");
    expect(await codeOf(resetRoom(rpcDb({ reset_room: { data: "room_closed", error: null } }).db, "r", 25))).toBe("ROOM_CLOSED");
    try {
      await resetRoom(rpcDb({ reset_room: { data: null, error: { code: "XX", message: "secret internals" } } }).db, "r", 25);
    } catch (err) {
      expect((err as AppError).message).not.toContain("secret internals");
      expect((err as AppError).internal).toContain("secret internals");
    }
  });

  it("setPlayerMuted: true when found, false when not, ROOM_CLOSED when closed", async () => {
    const found = rpcDb({ set_player_muted: { data: "ok", error: null } });
    expect(await setPlayerMuted(found.db, "r", "Ana", true)).toBe(true);
    expect(found.calls[0]).toEqual({ fn: "set_player_muted", args: { p_room_id: "r", p_nickname: "Ana", p_muted: true } });
    expect(await setPlayerMuted(rpcDb({ set_player_muted: { data: "not_found", error: null } }).db, "r", "Zed", true)).toBe(false);
    expect(await codeOf(setPlayerMuted(rpcDb({ set_player_muted: { data: "room_closed", error: null } }).db, "r", "Ana", false))).toBe(
      "ROOM_CLOSED",
    );
  });
});

describe("new outcomes from the database", () => {
  it("submit_attempt 'paused' becomes ROOM_PAUSED", async () => {
    const db = rpcDb({ submit_attempt: { data: [{ o_outcome: "paused", o_result: null, o_is_winner: null }], error: null } }).db;
    expect(await codeOf(submitAttempt(db, "r", "hash", 25))).toBe("ROOM_PAUSED");
  });

  it("post_chat_message 'muted' becomes PLAYER_MUTED", async () => {
    const db = rpcDb({ post_chat_message: { data: [{ o_outcome: "muted", o_id: null }], error: null } }).db;
    expect(await codeOf(postChatMessage(db, "r", "hash", "hola"))).toBe("PLAYER_MUTED");
  });

  it("apply_due_timers returns the clues, and an old answer without them still works", async () => {
    const withClues = rpcDb({
      apply_due_timers: {
        data: [{ o_phase: "paused", o_start_deadline_at: null, o_server_now: "2026-11-12T10:00:00Z", o_clues: [{ kind: "type", value: "Planta" }] }],
        error: null,
      },
    }).db;
    expect(await applyDueTimers(withClues, "r")).toMatchObject({ phase: "paused", clues: [{ kind: "type", value: "Planta" }] });
    const old = rpcDb({
      apply_due_timers: { data: [{ o_phase: "playing", o_start_deadline_at: null, o_server_now: "2026-11-12T10:00:00Z" }], error: null },
    }).db;
    expect(await applyDueTimers(old, "r")).toMatchObject({ phase: "playing", clues: [] });
  });
});

describe("getFeed (phase 3)", () => {
  it("a free room with clues on asks for the timers and returns the clues", async () => {
    const { db, calls } = rpcDb({
      ...empty,
      apply_due_timers: {
        data: [
          {
            o_phase: "playing",
            o_start_deadline_at: null,
            o_server_now: "2026-11-12T10:00:00Z",
            o_clues: [{ kind: "generation", value: "3" }],
          },
        ],
        error: null,
      },
    });
    const feed = await getFeed(db, { ...room, phase: "playing", mode: "free", clueMax: 2, cluesRevealed: 0 }, { after: null, chatAfter: null, full: false });
    expect(calls.map((c) => c.fn)).toContain("apply_due_timers");
    expect(feed.status).toBe("playing");
    expect(feed.clues).toEqual([{ kind: "generation", value: "3" }]);
    expect(feed.round).toBe(1);
  });

  it("a free room with clues off and none revealed does not touch the timers", async () => {
    const { db, calls } = rpcDb(empty);
    const feed = await getFeed(db, { ...room, phase: "playing", mode: "free", clueMax: 0, cluesRevealed: 0 }, { after: null, chatAfter: null, full: false });
    expect(calls.map((c) => c.fn)).not.toContain("apply_due_timers");
    expect(feed.clues).toBeNull();
  });

  it("a paused room is reported as paused and asks for the timers (no turn, no deadline)", async () => {
    const { db } = rpcDb({
      ...empty,
      apply_due_timers: { data: [{ o_phase: "paused", o_start_deadline_at: null, o_server_now: "2026-11-12T10:00:00Z", o_clues: [] }], error: null },
    });
    const feed = await getFeed(db, { ...room, phase: "paused", mode: "turns", clueMax: 0, cluesRevealed: 0 }, { after: null, chatAfter: null, full: false });
    expect(feed).toMatchObject({ status: "paused", turnNickname: null, turnDeadlineAt: null });
  });

  it("a finished room is finished even if the phase says paused, and sends no clues", async () => {
    const { db } = rpcDb(empty);
    const feed = await getFeed(
      db,
      { ...room, finishedAt: "2026-11-12T10:00:00Z", phase: "playing", mode: "free", clueMax: 2, cluesRevealed: 2 },
      { after: null, chatAfter: null, full: false },
    );
    expect(feed.status).toBe("finished");
    expect(feed.clues).toBeNull();
  });

  it("only the admin gets the muted list", async () => {
    const players = [
      { nickname: "Ana", last_seen_at: "2026-11-12T10:00:00Z", muted_at: "2026-11-12T10:01:00Z" },
      { nickname: "Beto", last_seen_at: "2026-11-12T10:00:00Z", muted_at: null },
    ];
    const base = { ...room, phase: "playing" as const, mode: "free" as const, clueMax: 0, cluesRevealed: 0 };
    const hints = { list_hints: { data: [], error: null } };
    const asAdmin = await getFeed(rpcDb({ ...empty, ...hints }, players).db, base, { after: null, chatAfter: null, full: true, viewerIsAdmin: true });
    expect(asAdmin.mutedPlayers).toEqual(["Ana"]);
    const asPlayer = await getFeed(rpcDb({ ...empty, ...hints }, players).db, base, { after: null, chatAfter: null, full: true });
    expect(asPlayer.mutedPlayers).toBeNull();
    expect(asPlayer.players).toEqual(["Ana", "Beto"]);
  });
});

describe("parseFeed (phase 3)", () => {
  const base = { status: "playing", attempts: [], cursor: 0, hasMore: false, chat: [], chatCursor: 0 };
  const body = (extra: Record<string, unknown>) => ({ data: { ...base, ...extra }, error: null });

  it("reads clues, round and the muted list, and tolerates their absence", () => {
    expect(parseFeed(body({ status: "paused", round: 3, clues: [{ kind: "type", value: "Fuego" }], mutedPlayers: ["Ana"] }))).toMatchObject({
      status: "paused",
      round: 3,
      clues: [{ kind: "type", value: "Fuego" }],
      mutedPlayers: ["Ana"],
    });
    expect(parseFeed(body({}))).toMatchObject({ round: 1, clues: null, mutedPlayers: null });
  });

  it.each([
    ["clue with a wrong kind", { clues: [{ kind: "color", value: "Rojo" }] }],
    ["clue without a value", { clues: [{ kind: "type" }] }],
    ["clues that are not a list", { clues: "Planta" }],
    ["round as text", { round: "2" }],
    ["muted list with a number", { mutedPlayers: ["Ana", 2] }],
  ])("rejects %s", (_name, extra) => {
    expect(parseFeed(body(extra))).toBeNull();
  });
});
