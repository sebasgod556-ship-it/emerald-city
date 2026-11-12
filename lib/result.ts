// Shared { data, error } contract for Server Actions and Route Handlers (see docs/CONTRACTS.md).
export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "ROOM_LIMIT_REACHED"
  | "ROOM_CLOSED"
  | "ROOM_FULL"
  | "ROUND_FINISHED"
  | "ROOM_NOT_STARTED"
  | "NOT_YOUR_TURN"
  | "PLAYER_KICKED"
  | "ALREADY_TRIED"
  | "NICKNAME_TAKEN"
  | "RATE_LIMITED"
  | "EXTERNAL_SERVICE_UNAVAILABLE"
  | "INTERNAL";

export type AppErrorBody = {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
};

export type Result<T> = { data: T; error: null } | { data: null; error: AppErrorBody };

/** HTTP status per code. Used by Route Handlers only; Server Actions return just the code. */
export const HTTP_STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  ROOM_LIMIT_REACHED: 409,
  ROOM_CLOSED: 409,
  ROOM_FULL: 409,
  ROUND_FINISHED: 409,
  ROOM_NOT_STARTED: 409,
  NOT_YOUR_TURN: 409,
  PLAYER_KICKED: 403,
  ALREADY_TRIED: 409,
  NICKNAME_TAKEN: 409,
  RATE_LIMITED: 429,
  EXTERNAL_SERVICE_UNAVAILABLE: 503,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly details: Record<string, unknown> | undefined;
  /** Original internal message (e.g. from Postgres). Logged server-side, NEVER sent to the client. */
  readonly internal: string | undefined;

  constructor(
    code: ErrorCode,
    message: string,
    options?: { details?: Record<string, unknown>; internal?: string },
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.details = options?.details;
    this.internal = options?.internal;
  }
}

export function ok<T>(data: T): Result<T> {
  return { data, error: null };
}

export function fail(code: ErrorCode, message: string, details?: Record<string, unknown>): Result<never> {
  return { data: null, error: details ? { code, message, details } : { code, message } };
}

/** Structured JSON log line. Never put PII or secrets in `fields`. */
export function logEvent(level: "info" | "warn" | "error", event: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ level, event, ts: new Date().toISOString(), ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}

/** Turns anything thrown into a safe Result. Internal messages are logged, never returned. */
export function toFailure(err: unknown, requestId: string): Result<never> {
  if (err instanceof AppError) {
    if (err.internal !== undefined || HTTP_STATUS[err.code] >= 500) {
      logEvent("error", "app_error", { request_id: requestId, code: err.code, internal: err.internal });
    }
    return fail(err.code, err.message, err.details);
  }
  logEvent("error", "unexpected_error", {
    request_id: requestId,
    name: err instanceof Error ? err.name : "unknown",
    message: err instanceof Error ? err.message : String(err),
  });
  return fail("INTERNAL", "Ocurrió un error inesperado. Intenta de nuevo.");
}
