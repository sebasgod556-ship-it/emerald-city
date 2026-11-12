import { describe, expect, it } from "vitest";
import {
  createRoomInputSchema,
  kickPlayerInputSchema,
  startRoomInputSchema,
  updateCooldownInputSchema,
  DEFAULT_COOLDOWN_SECONDS,
  DEFAULT_WAIT_MINUTES,
  DEFAULT_TURN_SECONDS,
} from "./rooms";

describe("createRoomInputSchema", () => {
  it("fills the defaults (3 s between attempts, 5 minutes of waiting room)", () => {
    const parsed = createRoomInputSchema.parse({ pokemonId: 25 });
    expect(parsed).toEqual({
      pokemonId: 25,
      cooldownSeconds: DEFAULT_COOLDOWN_SECONDS,
      waitMinutes: DEFAULT_WAIT_MINUTES,
      mode: "free",
      turnOrder: "random",
      turnSeconds: DEFAULT_TURN_SECONDS,
    });
    expect(DEFAULT_TURN_SECONDS).toBe(20);
    expect(DEFAULT_COOLDOWN_SECONDS).toBe(3);
    expect(DEFAULT_WAIT_MINUTES).toBe(5);
  });

  it("accepts the edges of both ranges, including 0 minutes (no waiting room)", () => {
    expect(createRoomInputSchema.safeParse({ pokemonId: 1, cooldownSeconds: 1, waitMinutes: 0 }).success).toBe(true);
    expect(createRoomInputSchema.safeParse({ pokemonId: 1, cooldownSeconds: 120, waitMinutes: 60 }).success).toBe(true);
  });

  it.each([
    ["cooldown 0", { pokemonId: 1, cooldownSeconds: 0 }],
    ["cooldown 121", { pokemonId: 1, cooldownSeconds: 121 }],
    ["cooldown 2.5", { pokemonId: 1, cooldownSeconds: 2.5 }],
    ["cooldown as text", { pokemonId: 1, cooldownSeconds: "3" }],
    ["wait -1", { pokemonId: 1, waitMinutes: -1 }],
    ["wait 61", { pokemonId: 1, waitMinutes: 61 }],
    ["no pokemon", { cooldownSeconds: 3 }],
    ["mode paused", { pokemonId: 1, mode: "paused" }],
    ["order sideways", { pokemonId: 1, turnOrder: "sideways" }],
    ["turn 4 s", { pokemonId: 1, turnSeconds: 4 }],
    ["turn 121 s", { pokemonId: 1, turnSeconds: 121 }],
    ["turn 7.5 s", { pokemonId: 1, turnSeconds: 7.5 }],
  ])("rejects %s", (_name, input) => {
    expect(createRoomInputSchema.safeParse(input).success).toBe(false);
  });
});

describe("admin action inputs", () => {
  it("normalizes the room code", () => {
    expect(startRoomInputSchema.parse({ roomCode: "abc-234" }).roomCode).toBe("ABC234");
    expect(updateCooldownInputSchema.parse({ roomCode: "abc234", seconds: 10 })).toEqual({ roomCode: "ABC234", seconds: 10 });
  });

  it("rejects a cooldown out of range or a bad code", () => {
    expect(updateCooldownInputSchema.safeParse({ roomCode: "ABC234", seconds: 0 }).success).toBe(false);
    expect(updateCooldownInputSchema.safeParse({ roomCode: "ABC234", seconds: 121 }).success).toBe(false);
    expect(startRoomInputSchema.safeParse({ roomCode: "no" }).success).toBe(false);
  });
});

describe("turn mode options", () => {
  it("accepts turns with each order and the edges of 5 to 120 seconds", () => {
    expect(createRoomInputSchema.safeParse({ pokemonId: 1, mode: "turns", turnOrder: "arrival", turnSeconds: 5 }).success).toBe(true);
    expect(createRoomInputSchema.safeParse({ pokemonId: 1, mode: "turns", turnOrder: "random", turnSeconds: 120 }).success).toBe(true);
  });
});

describe("kickPlayerInputSchema", () => {
  it("normalizes the code and trims the nickname", () => {
    expect(kickPlayerInputSchema.parse({ roomCode: "abc-234", nickname: "  Ana  " })).toEqual({ roomCode: "ABC234", nickname: "Ana" });
  });

  it.each([
    ["one letter", { roomCode: "ABC234", nickname: "A" }],
    ["21 letters", { roomCode: "ABC234", nickname: "a".repeat(21) }],
    ["bad code", { roomCode: "no", nickname: "Ana" }],
    ["no nickname", { roomCode: "ABC234" }],
  ])("rejects %s", (_name, input) => {
    expect(kickPlayerInputSchema.safeParse(input).success).toBe(false);
  });
});
