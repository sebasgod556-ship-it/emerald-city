import { describe, expect, it } from "vitest";
import { playerSessionHash } from "./player-session";
import { playerCookieName } from "./room-codes";
import { generatePlayerToken, hashPlayerToken, isPlayerToken } from "./room-secrets";

describe("player token", () => {
  it("generates 43-character url-safe tokens that are different every time", () => {
    const a = generatePlayerToken();
    const b = generatePlayerToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(isPlayerToken(a)).toBe(true);
    expect(a).not.toBe(b);
  });

  it("rejects values that are not our tokens", () => {
    expect(isPlayerToken("")).toBe(false);
    expect(isPlayerToken("short")).toBe(false);
    expect(isPlayerToken("a".repeat(44))).toBe(false);
    expect(isPlayerToken("a".repeat(42) + "!")).toBe(false);
  });

  it("hashes to 64 hex characters, never the token itself", () => {
    const token = generatePlayerToken();
    const hash = hashPlayerToken("ABC234", token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(token);
  });

  it("is deterministic and bound to the room", () => {
    const token = generatePlayerToken();
    expect(hashPlayerToken("ABC234", token)).toBe(hashPlayerToken("ABC234", token));
    expect(hashPlayerToken("ABC234", token)).not.toBe(hashPlayerToken("XYZ789", token));
  });

  it("does not collide with the admin code hash format", () => {
    // Different namespace prefix ("player:"), so a player token can never act as an admin code.
    const token = "A".repeat(43);
    expect(hashPlayerToken("ABC234", token)).not.toBe(hashPlayerToken("ABC234", "B".repeat(43)));
  });
});

describe("playerSessionHash", () => {
  const roomCode = "ABC234";
  const token = generatePlayerToken();

  it("returns the hash for a valid cookie of that room", () => {
    const jar = { get: (name: string) => (name === playerCookieName(roomCode) ? { value: token } : undefined) };
    expect(playerSessionHash(jar, roomCode)).toBe(hashPlayerToken(roomCode, token));
  });

  it("returns null without a cookie, for another room, or for a malformed value", () => {
    expect(playerSessionHash({ get: () => undefined }, roomCode)).toBeNull();
    const otherRoom = { get: (name: string) => (name === playerCookieName("XYZ789") ? { value: token } : undefined) };
    expect(playerSessionHash(otherRoom, roomCode)).toBeNull();
    expect(playerSessionHash({ get: () => ({ value: "not-a-token" }) }, roomCode)).toBeNull();
  });

  it("uses the documented cookie name", () => {
    expect(playerCookieName("ABC234")).toBe("ec_player_ABC234");
  });
});
