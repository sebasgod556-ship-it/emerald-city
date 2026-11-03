import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { AppError } from "./result";
import { hashIdentifier } from "./room-secrets";

const rowSchema = z.object({ allowed: z.boolean(), retry_after: z.number() });

/**
 * Counts one hit in the database-backed fixed window and throws RATE_LIMITED when over the limit.
 * Fails CLOSED: if the limiter itself cannot be reached, the request is refused.
 */
export async function enforceRateLimit(
  db: SupabaseClient,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<void> {
  const { data, error } = await db.rpc("rate_limit_hit", {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  const first: unknown = Array.isArray(data) ? data[0] : undefined;
  const parsed = rowSchema.safeParse(first);
  if (error || !parsed.success) {
    throw new AppError("EXTERNAL_SERVICE_UNAVAILABLE", "El servicio no está disponible. Intenta de nuevo en un momento.", {
      internal: error ? `${error.code}: ${error.message}` : "unexpected rate_limit_hit response",
    });
  }
  if (!parsed.data.allowed) {
    throw new AppError("RATE_LIMITED", "Demasiados intentos. Espera un momento e intenta de nuevo.", {
      details: { retryAfter: parsed.data.retry_after },
    });
  }
}

/** Hashed caller identifier (never the raw IP). Vercel sets x-forwarded-for. */
export function clientIdentifier(h: { get(name: string): string | null }): string {
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || h.get("x-real-ip") || "unknown";
  return hashIdentifier("ip", ip);
}
