import { NextResponse } from "next/server";
import { readEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

// Uptime check. Public response never exposes internal details.
export function GET() {
  const result = readEnv();

  if (!result.ok) {
    // Server-side log only: variable names, never values.
    console.error(
      JSON.stringify({ level: "error", msg: "env_invalid", invalid: result.invalid }),
    );
    return NextResponse.json(
      {
        data: null,
        error: { code: "INTERNAL", message: "Service is not configured correctly." },
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    { data: { status: "ok" }, error: null },
    { headers: { "Cache-Control": "no-store" } },
  );
}
