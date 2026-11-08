"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { closeRoomAction, startRoomAction, updateCooldownAction } from "../app/actions/rooms";
import { btnPrimary, btnSecondary, inputClass } from "../lib/ui";
import { MAX_COOLDOWN_SECONDS, MIN_COOLDOWN_SECONDS } from "../lib/validation/rooms";

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
