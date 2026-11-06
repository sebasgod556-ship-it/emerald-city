"use client";

import { submitAttemptAction } from "../app/actions/attempts";
import { HINT_META, type FeedAttempt, type FeedSnapshot } from "../lib/feed-types";
import { btnSecondary } from "../lib/ui";
import { PokemonPicker } from "./PokemonPicker";
import { useRoomFeed } from "./useRoomFeed";

/**
 * Room screen. A player (nickname set) can guess; the admin (nickname null) only watches.
 * Newest attempt first, so nobody has to scroll on a phone.
 */
export function GameRoom({
  roomCode,
  nickname,
  initial,
  maxPlayers,
}: {
  roomCode: string;
  nickname: string | null;
  initial: FeedSnapshot;
  maxPlayers: number;
}) {
  const feed = useRoomFeed(roomCode, initial);
  const winning = feed.attempts.find((a) => a.isWinner) ?? null;
  const newestFirst = [...feed.attempts].reverse();

  async function send(pokemonId: number): Promise<string | null> {
    const res = await submitAttemptAction({ roomCode, pokemonId });
    feed.refresh(); // show the new attempt (or the winner) without waiting for the next poll
    return res.error === null ? null : res.error.message;
  }

  return (
    <div className="flex w-full flex-col gap-4 text-left">
      {nickname !== null ? <h1 className="text-3xl font-bold text-ec-primary">Sala {roomCode}</h1> : null}
      <p>
        {nickname === null ? (
          "Vista del administrador: ves todos los intentos."
        ) : (
          <>
            Juegas como <strong>{nickname}</strong>. Adivina el Pokémon secreto: 🔥 coincide en tipo y generación,
            🌡️ solo en uno de los dos, ❄️ en ninguno.
          </>
        )}
      </p>

      {feed.finished ? (
        <p role="status" className="rounded-xl bg-ec-primary p-4 text-lg font-semibold text-ec-bg">
          {winning
            ? `🏆 ¡${winning.nickname} ganó! El Pokémon era ${winning.pokemon}.`
            : "🏆 La partida terminó: alguien adivinó el Pokémon."}
        </p>
      ) : null}

      {nickname !== null && !feed.finished ? <PokemonPicker disabled={false} onSend={send} /> : null}

      <section role="log" aria-label="Intentos de la partida" aria-live="polite" className="flex flex-col gap-2">
        <h2 className="font-semibold">Intentos</h2>
        {newestFirst.length === 0 ? (
          <p className="text-sm text-ec-muted">Todavía no hay intentos. ¡Sé el primero!</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {newestFirst.map((a) => (
              <AttemptItem key={a.id} attempt={a} mine={a.nickname === nickname} />
            ))}
          </ol>
        )}
      </section>

      <details className="rounded-xl bg-ec-surface p-4">
        <summary className="cursor-pointer font-semibold">
          Jugadores en la sala ({feed.players.length} de {maxPlayers})
        </summary>
        <ul aria-label="Lista de jugadores" className="mt-2 flex flex-col gap-1">
          {feed.players.map((name) => (
            <li key={name} className={name === nickname ? "font-semibold text-ec-primary" : undefined}>
              {name}
              {name === nickname ? " (tú)" : ""}
            </li>
          ))}
        </ul>
      </details>

      {feed.halted ? (
        <div role="alert" className="flex flex-col gap-2">
          <p className="text-sm text-red-400">No se pudo actualizar la partida. Revisa tu conexión.</p>
          <button type="button" onClick={feed.retry} className={btnSecondary}>
            Reintentar
          </button>
        </div>
      ) : feed.unstable ? (
        <p className="text-sm text-ec-muted">Reconectando...</p>
      ) : null}
    </div>
  );
}

function AttemptItem({ attempt, mine }: { attempt: FeedAttempt; mine: boolean }) {
  const hint = HINT_META[attempt.result];
  return (
    <li
      className={`flex items-center gap-3 rounded-xl bg-ec-surface p-3 ${mine ? "border border-ec-primary" : ""}`}
    >
      <span aria-hidden="true" className="text-2xl">
        {hint.icon}
      </span>
      <span>
        <span className="sr-only">{hint.label}: </span>
        <strong>{attempt.nickname}</strong> probó <span className="text-ec-primary">{attempt.pokemon}</span>
        {attempt.isWinner ? " 🏆" : ""}
      </span>
    </li>
  );
}
