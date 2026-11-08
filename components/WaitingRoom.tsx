"use client";

import { useEffect, useState } from "react";
import { StartRoomButton } from "./AdminControls";

function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Lobby shown before the game starts: countdown (on the server's clock), players who already arrived and,
 * for the admin only, the "Start now" button. Players cannot search or send anything here.
 */
export function WaitingRoom({
  roomCode,
  isAdmin,
  startsAt,
  players,
  maxPlayers,
  onStarted,
}: {
  roomCode: string;
  isAdmin: boolean;
  startsAt: { deadlineMs: number; offsetMs: number } | null;
  players: string[];
  maxPlayers: number;
  onStarted: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (startsAt === null) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [startsAt]);

  const remainingMs = startsAt === null ? null : startsAt.deadlineMs - (now + startsAt.offsetMs);

  return (
    <section aria-label="Sala de espera" className="flex flex-col gap-3 rounded-xl border border-ec-primary p-4">
      <h2 className="text-xl font-semibold text-ec-primary">Sala de espera</h2>
      {remainingMs === null ? (
        <p>La partida empieza cuando el administrador lo decida.</p>
      ) : remainingMs > 0 ? (
        <p>
          La partida empieza en <strong aria-hidden="true">{formatRemaining(remainingMs)}</strong>
          <span className="sr-only"> {Math.ceil(remainingMs / 1000)} segundos</span>
          {isAdmin ? ", o cuando pulses el botón." : ", o cuando el administrador la inicie."}
        </p>
      ) : (
        <p role="status">Empezando...</p>
      )}
      <p className="text-sm text-ec-muted">
        {players.length} de {maxPlayers} jugadores en la sala.
      </p>
      {players.length > 0 ? (
        <ul aria-label="Jugadores que ya llegaron" className="flex flex-wrap gap-2">
          {players.map((name) => (
            <li key={name} className="rounded-full bg-ec-surface px-3 py-1 text-sm">
              {name}
            </li>
          ))}
        </ul>
      ) : null}
      {isAdmin ? <StartRoomButton roomCode={roomCode} onStarted={onStarted} /> : null}
    </section>
  );
}
