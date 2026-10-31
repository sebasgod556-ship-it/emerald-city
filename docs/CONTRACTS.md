# CONTRACTS — Emerald City

contract-v0.1 · backend-v0.1 · design: none yet (provisional UI)

## 1. Project answers (from BRIEF v1.6)
- Mode: new project. Roles: Admin (room code), Player (nickname only). Login: none.
- Language: es (Pokémon names in Spanish). Time zone: America/Caracas (UTC-4).
- Dark mode: base theme (dark green + black). ASSUMPTION: no light mode.
- Appointments: no. Payments: no (Stripe omitted). Mobile: mandatory.
- Rooms: one active room at a time. Players: up to 100 (plan B: 30–50). Cost: zero.

## 2. Stack and versions
Version ranges, NOT yet verified by install (no network in this environment).
Next.js ^15.5 (App Router) · React ^19 · TypeScript ^5.6 strict + noUncheckedIndexedAccess · Tailwind ^4 · Zod ^4 · ESLint 8 (`next lint`).
Added in later steps: Supabase (@supabase/ssr, supabase-js), TanStack Query, Vitest, pgTAP.

## 3. Name in design → file in code (PROVISIONAL)
| Name in design | File |
|---|---|
| RootLayout | app/layout.tsx |
| HomePage | app/page.tsx |
| LogoPlaceholder (reserved space) | inside app/page.tsx |
| Design tokens (@theme) | app/globals.css |

## 4. Tokens (PROVISIONAL, green is EXAMPLE)
| Token | Value |
|---|---|
| --color-ec-bg | #050a07 |
| --color-ec-surface | #0d1a12 |
| --color-ec-primary | #1f9d55 (EXAMPLE) |
| --color-ec-text | #e8f5ec |
| --color-ec-muted | #8fb09b |

## 5. Permissions matrix
No tables yet. Defined in Step 3 (rooms) and Step 2 (pokemon).

## 6. Error format
`{ data, error }` for Route Handlers and Server Actions. `error = { code, message, details? }`.
Route Handler statuses: 400 validation, 401 unauthenticated, 403 forbidden, 404 not found, 409 conflict, 429 rate limited (Retry-After), 500 internal, 503 external service unavailable.
Codes in use: INTERNAL.

## 7. Endpoints
| Route | Type | Notes |
|---|---|---|
| GET /api/health | Route Handler | 200 `{ data: { status: "ok" } }`; 500 INTERNAL if env is invalid. Does not touch the database yet. |

## 8. Environment variables (names only)
| Name | Exposure |
|---|---|
| NEXT_PUBLIC_SUPABASE_URL | public |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | public |
| SUPABASE_SERVICE_ROLE_KEY | secret, server only |
Upstash variables: not used in Phase 1 (BRIEF v1.6 assumption).

## 9. Rate limits
None yet. Planned for room creation, admin login and nickname entry (Step 3–4), with the store decided and justified then.

## 10. Tables changed in this work
None.

## 11. Accepted accessibility exceptions
None.

## 12. Security headers
Set in next.config.ts: HSTS, nosniff, X-Frame-Options DENY, Referrer-Policy, Permissions-Policy. CSP pending (Phase 3, tested with Realtime).

## 13. Pending technical decisions (due before Phase 2)
Timer mechanism (turn skip at 20 s, close empty room at 5 min) and the 100 messages/second Realtime budget. To be written here at the close of Phase 1.

## 14. Changelog
- backend-v0.1 / contract-v0.1: base site, GET /api/health, env validation, provisional tokens.
