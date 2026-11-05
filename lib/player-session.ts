// SERVER ONLY (uses node:crypto through room-secrets).
import { playerCookieName } from "./room-codes";
import { hashPlayerToken, isPlayerToken } from "./room-secrets";

type CookieReader = { get(name: string): { value: string } | undefined };

/**
 * Hash of the player token stored in this browser's cookie for the given room,
 * or null when there is no cookie or it does not look like one of our tokens.
 */
export function playerSessionHash(jar: CookieReader, roomCode: string): string | null {
  const token = jar.get(playerCookieName(roomCode))?.value;
  return token !== undefined && isPlayerToken(token) ? hashPlayerToken(roomCode, token) : null;
}
