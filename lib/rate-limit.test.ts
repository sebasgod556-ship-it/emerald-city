import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { clientIdentifier, enforceRateLimit } from "./rate-limit";

function fakeDb(response: { data: unknown; error: { code: string; message: string } | null }): SupabaseClient {
  return { rpc: async () => response } as unknown as SupabaseClient;
}

describe("enforceRateLimit", () => {
  it("passes when the hit is allowed", async () => {
    await enforceRateLimit(fakeDb({ data: [{ allowed: true, retry_after: 0 }], error: null }), "k", 5, 60);
  });

  it("throws RATE_LIMITED with retryAfter when over the limit", async () => {
    await expect(
      enforceRateLimit(fakeDb({ data: [{ allowed: false, retry_after: 42 }], error: null }), "k", 5, 60),
    ).rejects.toMatchObject({ code: "RATE_LIMITED", details: { retryAfter: 42 } });
  });

  it("fails closed when the database errors, without leaking the internal message", async () => {
    await expect(
      enforceRateLimit(fakeDb({ data: null, error: { code: "XX000", message: "secret internal detail" } }), "k", 5, 60),
    ).rejects.toMatchObject({ code: "EXTERNAL_SERVICE_UNAVAILABLE", internal: "XX000: secret internal detail" });
    try {
      await enforceRateLimit(fakeDb({ data: null, error: { code: "XX000", message: "secret internal detail" } }), "k", 5, 60);
    } catch (err) {
      expect(String((err as Error).message).includes("secret")).toBe(false);
    }
  });

  it("fails closed on an unexpected response shape", async () => {
    await expect(enforceRateLimit(fakeDb({ data: [], error: null }), "k", 5, 60)).rejects.toMatchObject({
      code: "EXTERNAL_SERVICE_UNAVAILABLE",
    });
  });
});

describe("clientIdentifier", () => {
  const headersOf = (map: Record<string, string>) => ({ get: (name: string) => map[name] ?? null });

  it("uses the first forwarded IP, hashed", () => {
    const id = clientIdentifier(headersOf({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }));
    expect(/^[0-9a-f]{64}$/.test(id)).toBe(true);
    expect(id).toBe(clientIdentifier(headersOf({ "x-forwarded-for": "203.0.113.7" })));
    expect(id === clientIdentifier(headersOf({ "x-forwarded-for": "198.51.100.9" }))).toBe(false);
  });

  it("falls back when there is no IP header", () => {
    expect(/^[0-9a-f]{64}$/.test(clientIdentifier(headersOf({})))).toBe(true);
  });
});
