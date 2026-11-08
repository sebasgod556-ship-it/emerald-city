import { describe, expect, it } from "vitest";
import {
  createRoomInputSchema,
  startRoomInputSchema,
  updateCooldownInputSchema,
  DEFAULT_COOLDOWN_SECONDS,
  DEFAULT_WAIT_MINUTES,
} from "./rooms";

describe("createRoomInputSchema", () => {
  it("fills the defaults (3 s between attempts, 5 minutes of waiting room)", () => {
    const parsed = createRoomInputSchema.parse({ pokemonId: 25 });
    expect(parsed).toEqual({ pokemonId: 25, cooldownSeconds: DEFAULT_COOLDOWN_SECONDS, waitMinutes: DEFAULT_WAIT_MINUTES });
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
