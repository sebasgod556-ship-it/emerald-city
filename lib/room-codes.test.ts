import { describe, expect, it } from "vitest";
import { CODE_ALPHABET, adminCookieName, extractRoomCode, formatAdminCode, normalizeCode } from "./room-codes";
import {
  generateAdminCode,
  generateRoomCode,
  hashAdminCode,
  hashIdentifier,
  verifyAdminCode,
} from "./room-secrets";
import { ADMIN_CODE_PATTERN, ROOM_CODE_PATTERN, loginAdminInputSchema } from "./validation/rooms";

describe("room code helpers", () => {
  it("normalizes case, spaces and dashes", () => {
    expect(normalizeCode(" abcd-efgh jkmn ")).toBe("ABCDEFGHJKMN");
  });

  it("extracts a room code from a bare code or a pasted link", () => {
    expect(extractRoomCode("abc234")).toBe("ABC234");
    expect(extractRoomCode("https://emerald-city.vercel.app/sala/abc234")).toBe("ABC234");
    expect(extractRoomCode("https://emerald-city.vercel.app/sala/ABC234/admin")).toBe("ABC234");
  });

  it("formats the admin code in groups of four", () => {
    expect(formatAdminCode("ABCDEFGHJKMN")).toBe("ABCD-EFGH-JKMN");
  });

  it("builds a per-room cookie name", () => {
    expect(adminCookieName("ABC234")).toBe("ec_admin_ABC234");
  });

  it("uses an alphabet of 32 characters without I, O, 0, 1", () => {
    expect(CODE_ALPHABET).toHaveLength(32);
    expect(/[IO01]/.test(CODE_ALPHABET)).toBe(false);
  });
});

describe("room secrets", () => {
  it("generates codes of the right size and alphabet", () => {
    for (let i = 0; i < 200; i++) {
      expect(ROOM_CODE_PATTERN.test(generateRoomCode())).toBe(true);
      expect(ADMIN_CODE_PATTERN.test(generateAdminCode())).toBe(true);
    }
  });

  it("generates different admin codes each time", () => {
    const codes = new Set<string>();
    for (let i = 0; i < 200; i++) codes.add(generateAdminCode());
    expect(codes.size).toBe(200);
  });

  it("hashes to 64 hex characters, never containing the code", () => {
    const hash = hashAdminCode("ABC234", "ABCDEFGHJKMN");
    expect(/^[0-9a-f]{64}$/.test(hash)).toBe(true);
    expect(hash.includes("ABCDEFGHJKMN")).toBe(false);
  });

  it("verifies only the correct code for the correct room", () => {
    const hash = hashAdminCode("ABC234", "ABCDEFGHJKMN");
    expect(verifyAdminCode("ABC234", "ABCDEFGHJKMN", hash)).toBe(true);
    expect(verifyAdminCode("ABC234", "ABCDEFGHJKMM", hash)).toBe(false);
    expect(verifyAdminCode("ABC235", "ABCDEFGHJKMN", hash)).toBe(false);
    expect(verifyAdminCode("ABC234", "ABCDEFGHJKMN", "not-a-hash")).toBe(false);
  });

  it("hashes identifiers without exposing them", () => {
    const hash = hashIdentifier("ip", "203.0.113.7");
    expect(/^[0-9a-f]{64}$/.test(hash)).toBe(true);
    expect(hash.includes("203")).toBe(false);
    expect(hashIdentifier("ip", "203.0.113.7")).toBe(hash);
  });
});

describe("login input schema", () => {
  it("accepts lowercase, dashes and spaces", () => {
    const parsed = loginAdminInputSchema.safeParse({ roomCode: "abc234", adminCode: "abcd-efgh-jkmn" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.adminCode).toBe("ABCDEFGHJKMN");
  });

  it("rejects codes with the wrong length or forbidden characters", () => {
    expect(loginAdminInputSchema.safeParse({ roomCode: "ABC23", adminCode: "ABCDEFGHJKMN" }).success).toBe(false);
    expect(loginAdminInputSchema.safeParse({ roomCode: "ABC234", adminCode: "ABCDEFGHJKM0" }).success).toBe(false);
    expect(loginAdminInputSchema.safeParse({ roomCode: "ABC234", adminCode: 42 }).success).toBe(false);
  });
});
