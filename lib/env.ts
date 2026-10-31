import { z } from "zod";

// Single source of truth for environment variables (t3-env pattern).
// NEXT_PUBLIC_* are exposed to the browser by design. The service role key
// must only be read from server code and never get a NEXT_PUBLIC_ prefix.
const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});

export type Env = z.infer<typeof envSchema>;

export type EnvResult =
  | { ok: true; env: Env }
  | { ok: false; invalid: string[] };

/** Validates process.env. Returns variable NAMES only, never values. */
export function readEnv(): EnvResult {
  const parsed = envSchema.safeParse(process.env);
  if (parsed.success) return { ok: true, env: parsed.data };
  const invalid = [
    ...new Set(parsed.error.issues.map((issue) => String(issue.path[0] ?? "unknown"))),
  ];
  return { ok: false, invalid };
}
