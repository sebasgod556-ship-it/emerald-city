"use client";

import { useEffect, useState } from "react";

/**
 * Turn mode: who has the turn and how many seconds are left (on the server's clock). The player whose turn it is
 * gets a clear call to act; everybody else just sees whose turn it is. Announced politely to screen readers
 * when the holder changes (not every second).
 */
export function TurnBanner({
  turn,
  me,
}: {
  turn: { nickname: string; deadlineMs: number; offsetMs: number } | null;
  /** The viewer's nickname, or null for the admin. */
  me: string | null;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (turn === null) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [turn]);

  if (turn === null) {
    return (
      <p role="status" className="rounded-xl bg-ec-surface p-4 text-ec-muted">
        Esperando al siguiente jugador...
      </p>
    );
  }

  const seconds = Math.max(0, Math.ceil((turn.deadlineMs - (now + turn.offsetMs)) / 1000));
  const mine = me !== null && turn.nickname === me;

  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-xl p-4 ${mine ? "bg-ec-primary text-ec-bg" : "bg-ec-surface"}`}
    >
      <p role="status" className="font-semibold">
        {mine ? "¡Es tu turno!" : `Turno de ${turn.nickname}`}
      </p>
      <p aria-hidden="true" className="text-2xl font-bold tabular-nums">
        {seconds} s
      </p>
    </div>
  );
}
