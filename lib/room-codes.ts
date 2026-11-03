// Pure string helpers for room and admin codes. Safe to import from client components.
// Alphabet: 32 characters, no I, O, 0 or 1 so codes are easy to read and type on a phone.
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Uppercase and keep only letters and digits. */
export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Accepts a bare code ("abc234") or a pasted link ("https://site/sala/ABC234/admin"). */
export function extractRoomCode(input: string): string {
  const match = input.match(/\/sala\/([A-Za-z0-9]+)/);
  return normalizeCode(match?.[1] ?? input);
}

/** "ABCDEFGHJKMN" -> "ABCD-EFGH-JKMN" (display only). */
export function formatAdminCode(code: string): string {
  return code.replace(/(.{4})(?=.)/g, "$1-");
}

export function adminCookieName(roomCode: string): string {
  return `ec_admin_${roomCode}`;
}
