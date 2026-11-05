// SERVER ONLY (uses node:crypto). Never import from a client component.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { CODE_ALPHABET } from "./room-codes";

// 256 is divisible by 32, so "byte % 32" is perfectly uniform (no modulo bias).
function randomCode(length: number): string {
  let out = "";
  for (const byte of randomBytes(length)) out += CODE_ALPHABET.charAt(byte % CODE_ALPHABET.length);
  return out;
}

/** 6 characters, public: it is part of the room link. */
export function generateRoomCode(): string {
  return randomCode(6);
}

/** 12 characters (60 bits), secret: shown once to the creator, stored only as a hash. */
export function generateAdminCode(): string {
  return randomCode(12);
}

/** sha256("<roomCode>:<adminCode>") as 64 hex characters. The code itself is never stored. */
export function hashAdminCode(roomCode: string, adminCode: string): string {
  return createHash("sha256").update(`${roomCode}:${adminCode}`).digest("hex");
}

/** Constant-time comparison against the stored hash. */
export function verifyAdminCode(roomCode: string, adminCode: string, storedHash: string): boolean {
  const candidate = Buffer.from(hashAdminCode(roomCode, adminCode), "hex");
  const stored = Buffer.from(storedHash, "hex");
  return candidate.length === stored.length && timingSafeEqual(candidate, stored);
}

/** Hash of an identifier (e.g. an IP) so raw personal data never reaches the database or logs. */
export function hashIdentifier(namespace: string, value: string): string {
  return createHash("sha256").update(`${namespace}:${value}`).digest("hex");
}

/** Random player token kept in the httpOnly cookie: 32 bytes as 43 base64url characters. */
export function generatePlayerToken(): string {
  return randomBytes(32).toString("base64url");
}

const PLAYER_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** Cheap shape check so arbitrary cookie values are never hashed or looked up. */
export function isPlayerToken(value: string): boolean {
  return PLAYER_TOKEN_PATTERN.test(value);
}

/** sha256("player:<roomCode>:<token>") as 64 hex characters. Only this hash is stored. */
export function hashPlayerToken(roomCode: string, token: string): string {
  return createHash("sha256").update(`player:${roomCode}:${token}`).digest("hex");
}
