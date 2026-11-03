// SERVER ONLY. The service role key must never reach the browser.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readEnv } from "../env";

const options = { auth: { persistSession: false, autoRefreshToken: false } } as const;

/** Full-access client for server code (rooms, rate limits, secret Pokémon). */
export function createServiceClient(): SupabaseClient {
  const result = readEnv();
  if (!result.ok) throw new Error(`Invalid environment variables: ${result.invalid.join(", ")}`);
  return createClient(result.env.NEXT_PUBLIC_SUPABASE_URL, result.env.SUPABASE_SERVICE_ROLE_KEY, options);
}

/** Limited client (role anon). Can only read the public pokemon_names view. */
export function createAnonClient(): SupabaseClient {
  const result = readEnv();
  if (!result.ok) throw new Error(`Invalid environment variables: ${result.invalid.join(", ")}`);
  return createClient(result.env.NEXT_PUBLIC_SUPABASE_URL, result.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, options);
}
