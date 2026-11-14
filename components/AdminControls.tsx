"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  closeRoomAction,
  kickPlayerAction,
  mutePlayerAction,
  pauseRoomAction,
  resetRoomAction,
  resumeRoomAction,
  skipTurnAction,
  startRoomAction,
  updateClueSettingsAction,
  updateCooldownAction,
} from "../app/actions/rooms";
import { btnPrimary, btnSecondary, inputClass } from "../lib/ui";
import {
  MAX_CLUE_INTERVAL_SECONDS,
  MAX_CLUE_MAX,
  MAX_COOLDOWN_SECONDS,
  MIN_CLUE_INTERVAL_SECONDS,
  MIN_CLUE_MAX,
  MIN_COOLDOWN_SECONDS,
} from "../lib/validation/rooms";
import { PokemonPicker } from "./PokemonPicker";

/** Two-step "Close room": the first tap asks for confirmation, so a stray tap cannot end the game. */
export function CloseRoomButton({ roomCode }: { roomCode: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function close() {
    setPending(true);
    setMessage(null);
    try {
      const res = await closeRoomAction({ roomCode });
      // ROOM_CLOSED also means "it is closed": show the closed screen either way.
      if (res.error === null || res.error.code === "ROOM_CLOSED") {
        router.refresh();
        return;
      }
      setMessage(res.error.message);
    } catch {
      setMessage("No se pudo conectar. Revisa tu internet e intenta de nuevo.");
    } finally {
      setPending(false);
    }
  }

  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className={btnSecondary}>
        Cerrar sala
      </button>
    );
  }

  return (
    <div role="group" aria-label="Confirmar cierre de la sala" className="flex w-full flex-col gap-3 rounded-xl bg-ec-surface p-4 text-left">
      <p>
        ¿Cerrar la sala? El enlace dejará de funcionar y se borrarán los intentos y los apodos. Esto no se puede
        deshacer.
      </p>
      {message ? (
        <p role="alert" className="text-sm text-red-400">
          {message}
        </p>
      ) : null}
      <button type="button" onClick={() => void close()} disabled={pending} className={btnPrimary}>
        {pending ? "Cerrando..." : "Sí, cerrar la sala"}
      </button>
      <button type="button" onClick={() => setConfirming(false)} disabled={pending} className={btnSecondary}>
        Cancelar
      </button>
    </div>
  );
}

/** "Start now" in the waiting room. Idempotent on the server: if the timer already started the game, nothing breaks. */
export function StartRoomButton({ roomCode, onStarted }: { roomCode: string; onStarted: () => void }) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function start() {
    setPending(true);
    setMessage(null);
    try {
      const res = await startRoomAction({ roomCode });
      if (res.error === null) onStarted();
      else setMessage(res.error.message);
    } catch {
      setMessage("No se pudo conectar. Revisa tu internet e intenta de nuevo.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex w-full flex-col gap-2">
      {message ? (
        <p role="alert" className="text-sm text-red-400">
          {message}
        </p>
      ) : null}
      <button type="button" onClick={() => void start()} disabled={pending} className={btnPrimary}>
        {pending ? "Empezando..." : "Empezar ya"}
      </button>
    </div>
  );
}

/** The admin changes the wait between attempts. Applies to the next attempt of every player. */
export function CooldownControl({ roomCode, initialSeconds }: { roomCode: string; initialSeconds: number }) {
  const [value, setValue] = useState(String(initialSeconds));
  const [saved, setSaved] = useState(initialSeconds);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const seconds = Number(value);
  const valid = value.trim() !== "" && Number.isInteger(seconds) && seconds >= MIN_COOLDOWN_SECONDS && seconds <= MAX_COOLDOWN_SECONDS;

  async function save() {
    if (!valid || pending) return;
    setPending(true);
    setMessage(null);
    try {
      const res = await updateCooldownAction({ roomCode, seconds });
      if (res.error === null) {
        setSaved(res.data.seconds);
        setMessage({ ok: true, text: "Guardado." });
      } else {
        setMessage({ ok: false, text: res.error.message });
      }
    } catch {
      setMessage({ ok: false, text: "No se pudo conectar. Revisa tu internet e intenta de nuevo." });
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="flex w-full flex-col gap-2 rounded-xl bg-ec-surface p-4 text-left">
      <label htmlFor="cooldown-seconds" className="font-semibold">
        Espera entre intentos (segundos)
      </label>
      <input
        id="cooldown-seconds"
        type="number"
        inputMode="numeric"
        min={MIN_COOLDOWN_SECONDS}
        max={MAX_COOLDOWN_SECONDS}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setMessage(null);
        }}
        className={inputClass}
        aria-describedby="cooldown-help"
      />
      <p id="cooldown-help" className="text-sm text-ec-muted">
        De {MIN_COOLDOWN_SECONDS} a {MAX_COOLDOWN_SECONDS}. Cada jugador espera esto entre un intento y el siguiente.
        Ahora: {saved} s.
      </p>
      {message ? (
        <p role={message.ok ? "status" : "alert"} className={message.ok ? "text-sm text-ec-primary" : "text-sm text-red-400"}>
          {message.text}
        </p>
      ) : null}
      <button type="button" onClick={() => void save()} disabled={!valid || pending} className={btnSecondary}>
        {pending ? "Guardando..." : "Guardar espera"}
      </button>
    </section>
  );
}

/** Kick one player. Two taps on purpose: the first asks "¿Expulsar a X?", the second confirms. */
export function KickPlayerButton({ roomCode, nickname, onKicked }: { roomCode: string; nickname: string; onKicked: () => void }) {
  const [asking, setAsking] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function kick() {
    setPending(true);
    setMessage(null);
    try {
      const res = await kickPlayerAction({ roomCode, nickname });
      if (res.error === null) {
        setAsking(false);
        onKicked();
      } else {
        setMessage(res.error.message);
        setAsking(false);
        onKicked(); // the player may be gone already: refresh the list either way
      }
    } catch {
      setMessage("No se pudo conectar. Revisa tu internet e intenta de nuevo.");
    } finally {
      setPending(false);
    }
  }

  if (!asking) {
    return (
      <span className="flex items-center gap-2">
        {message ? (
          <span role="alert" className="text-sm text-red-400">
            {message}
          </span>
        ) : null}
        <button type="button" onClick={() => setAsking(true)} className="text-sm text-red-400 underline">
          <span aria-hidden="true">Expulsar</span>
          <span className="sr-only">Expulsar a {nickname}</span>
        </button>
      </span>
    );
  }

  return (
    <span role="group" aria-label={`Confirmar expulsión de ${nickname}`} className="flex items-center gap-2 text-sm">
      <span>¿Expulsar a {nickname}?</span>
      <button type="button" onClick={() => void kick()} disabled={pending} className="text-red-400 underline">
        {pending ? "Expulsando..." : "Sí, expulsar"}
      </button>
      <button type="button" onClick={() => setAsking(false)} disabled={pending} className="underline">
        No
      </button>
    </span>
  );
}

const OFFLINE = "No se pudo conectar. Revisa tu internet e intenta de nuevo.";

/** Runs one admin action and reports an error message (or null). Keeps the buttons below short. */
function useAdminAction() {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function run(call: () => Promise<{ error: { message: string } | null }>, onDone: () => void) {
    setPending(true);
    setMessage(null);
    try {
      const res = await call();
      if (res.error === null) onDone();
      else setMessage(res.error.message);
    } catch {
      setMessage(OFFLINE);
    } finally {
      setPending(false);
    }
  }
  return { pending, message, run };
}

/** Pause or resume the game. Paused: no attempts, turns or clues; the chat keeps working. */
export function PauseResumeButton({ roomCode, paused, onDone }: { roomCode: string; paused: boolean; onDone: () => void }) {
  const { pending, message, run } = useAdminAction();
  return (
    <div className="flex w-full flex-col gap-2">
      {message ? (
        <p role="alert" className="text-sm text-red-400">
          {message}
        </p>
      ) : null}
      <button
        type="button"
        disabled={pending}
        onClick={() => void run(() => (paused ? resumeRoomAction({ roomCode }) : pauseRoomAction({ roomCode })), onDone)}
        className={paused ? btnPrimary : btnSecondary}
      >
        {pending ? "Un momento..." : paused ? "▶ Reanudar la partida" : "⏸ Pausar la partida"}
      </button>
    </div>
  );
}

/** Skip the turn of whoever holds it now (turn mode). */
export function SkipTurnButton({ roomCode, onDone }: { roomCode: string; onDone: () => void }) {
  const { pending, message, run } = useAdminAction();
  return (
    <div className="flex w-full flex-col gap-2">
      {message ? (
        <p role="alert" className="text-sm text-red-400">
          {message}
        </p>
      ) : null}
      <button type="button" disabled={pending} onClick={() => void run(() => skipTurnAction({ roomCode }), onDone)} className={btnSecondary}>
        {pending ? "Saltando..." : "⏭ Saltar el turno"}
      </button>
    </div>
  );
}

/** Mute or unmute one player in the chat. One tap: it is easy to undo. */
export function MutePlayerButton({
  roomCode,
  nickname,
  muted,
  onDone,
}: {
  roomCode: string;
  nickname: string;
  muted: boolean;
  onDone: () => void;
}) {
  const { pending, message, run } = useAdminAction();
  return (
    <span className="flex items-center gap-2">
      {message ? (
        <span role="alert" className="text-sm text-red-400">
          {message}
        </span>
      ) : null}
      <button
        type="button"
        disabled={pending}
        onClick={() => void run(() => mutePlayerAction({ roomCode, nickname, muted: !muted }), onDone)}
        className="text-sm underline"
      >
        <span aria-hidden="true">{muted ? "Quitar silencio" : "Silenciar"}</span>
        <span className="sr-only">{muted ? `Quitar el silencio a ${nickname}` : `Silenciar a ${nickname} en el chat`}</span>
      </button>
    </span>
  );
}

/** Automatic clues: how many and how often. 0 clues turns them off. */
export function ClueSettingsControl({
  roomCode,
  initialIntervalSeconds,
  initialMax,
}: {
  roomCode: string;
  initialIntervalSeconds: number;
  initialMax: number;
}) {
  const [interval, setInterval_] = useState(String(initialIntervalSeconds));
  const [max, setMax] = useState(String(initialMax));
  const [saved, setSaved] = useState({ intervalSeconds: initialIntervalSeconds, max: initialMax });
  const { pending, message, run } = useAdminAction();
  const [done, setDone] = useState(false);

  const intervalNumber = Number(interval);
  const maxNumber = Number(max);
  const valid =
    interval.trim() !== "" &&
    max.trim() !== "" &&
    Number.isInteger(intervalNumber) &&
    Number.isInteger(maxNumber) &&
    intervalNumber >= MIN_CLUE_INTERVAL_SECONDS &&
    intervalNumber <= MAX_CLUE_INTERVAL_SECONDS &&
    maxNumber >= MIN_CLUE_MAX &&
    maxNumber <= MAX_CLUE_MAX;

  return (
    <section className="flex w-full flex-col gap-2 rounded-xl bg-ec-surface p-4 text-left">
      <h2 className="font-semibold">Pistas automáticas</h2>
      <label htmlFor="clue-max" className="text-sm text-ec-muted">
        Cuántas pistas (0 = sin pistas)
      </label>
      <input
        id="clue-max"
        type="number"
        inputMode="numeric"
        min={MIN_CLUE_MAX}
        max={MAX_CLUE_MAX}
        value={max}
        onChange={(e) => {
          setMax(e.target.value);
          setDone(false);
        }}
        className={inputClass}
      />
      <label htmlFor="clue-interval" className="text-sm text-ec-muted">
        Cada cuántos segundos
      </label>
      <input
        id="clue-interval"
        type="number"
        inputMode="numeric"
        min={MIN_CLUE_INTERVAL_SECONDS}
        max={MAX_CLUE_INTERVAL_SECONDS}
        value={interval}
        onChange={(e) => {
          setInterval_(e.target.value);
          setDone(false);
        }}
        className={inputClass}
        aria-describedby="clue-help"
      />
      <p id="clue-help" className="text-sm text-ec-muted">
        De {MIN_CLUE_MAX} a {MAX_CLUE_MAX} pistas, cada {MIN_CLUE_INTERVAL_SECONDS} a {MAX_CLUE_INTERVAL_SECONDS} segundos, mientras nadie acierte.
        Ahora: {saved.max} {saved.max === 1 ? "pista" : "pistas"}, cada {saved.intervalSeconds} s. Al guardar, la cuenta empieza de nuevo.
      </p>
      {message ? (
        <p role="alert" className="text-sm text-red-400">
          {message}
        </p>
      ) : done ? (
        <p role="status" className="text-sm text-ec-primary">
          Guardado.
        </p>
      ) : null}
      <button
        type="button"
        disabled={!valid || pending}
        onClick={() =>
          void run(
            () => updateClueSettingsAction({ roomCode, intervalSeconds: intervalNumber, max: maxNumber }),
            () => {
              setSaved({ intervalSeconds: intervalNumber, max: maxNumber });
              setDone(true);
            },
          )
        }
        className={btnSecondary}
      >
        {pending ? "Guardando..." : "Guardar pistas"}
      </button>
    </section>
  );
}

/** Change the secret and restart. Opens a short explanation first; choosing the Pokémon is the confirmation. */
export function ResetRoomControl({ roomCode }: { roomCode: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);

  if (!open) {
    return (
      <>
        {done ? (
          <p role="status" className="w-full rounded-xl bg-ec-surface p-3 text-left text-sm text-ec-primary">
            Listo: nuevo secreto y la partida empezó de nuevo.
          </p>
        ) : null}
        <button type="button" onClick={() => setOpen(true)} className={btnSecondary}>
          Cambiar secreto y reiniciar
        </button>
      </>
    );
  }

  return (
    <section role="group" aria-label="Cambiar el secreto y reiniciar" className="flex w-full flex-col gap-3 rounded-xl bg-ec-surface p-4 text-left">
      <p>
        Elige el nuevo Pokémon secreto. Se borrarán los intentos, el chat y las pistas de esta partida; los jugadores se quedan en la sala.
      </p>
      <PokemonPicker
        disabled={false}
        cooldownSeconds={0}
        verb="Elegir y reiniciar con"
        onSend={async (pokemonId) => {
          try {
            const res = await resetRoomAction({ roomCode, pokemonId });
            if (res.error !== null) return { kind: "error", message: res.error.message };
          } catch {
            return { kind: "error", message: OFFLINE };
          }
          setOpen(false);
          setDone(true);
          router.refresh();
          return { kind: "sent" };
        }}
      />
      <button type="button" onClick={() => setOpen(false)} className={btnSecondary}>
        Cancelar
      </button>
    </section>
  );
}
