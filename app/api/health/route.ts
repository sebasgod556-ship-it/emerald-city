import { NextResponse } from "next/server";
import { readEnv } from "../../../lib/env";
import { logEvent } from "../../../lib/result";
import { createServiceClient } from "../../../lib/supabase/server";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

// Uptime check. The public response never exposes internal details.
// It also queries the database, which keeps the Supabase Free project from being paused and
// proves that SUPABASE_SERVICE_ROLE_KEY really is the service_role key: with the anon key this
// read is denied (rooms has no privileges for anon), so a wrong key shows up here immediately.
export async function GET() {
  const result = readEnv();
  if (!result.ok) {
    // Server-side log only: variable names, never values.
    logEvent("error", "health_env_invalid", { invalid: result.invalid });
    return NextResponse.json(
      { data: null, error: { code: "INTERNAL", message: "Service is not configured correctly." } },
      { status: 500, headers: NO_STORE },
    );
  }

  try {
    const { error } = await createServiceClient().from("rooms").select("id").limit(1);
    if (error) {
      logEvent("error", "health_db_failed", { internal: `${error.code}: ${error.message}` });
      return NextResponse.json(
        { data: null, error: { code: "EXTERNAL_SERVICE_UNAVAILABLE", message: "Service is unavailable." } },
        { status: 503, headers: NO_STORE },
      );
    }
  } catch (err) {
    logEvent("error", "health_db_failed", { internal: err instanceof Error ? err.name : "unknown" });
    return NextResponse.json(
      { data: null, error: { code: "EXTERNAL_SERVICE_UNAVAILABLE", message: "Service is unavailable." } },
      { status: 503, headers: NO_STORE },
    );
  }

  return NextResponse.json({ data: { status: "ok" }, error: null }, { headers: NO_STORE });
}
