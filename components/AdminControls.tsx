"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { closeRoomAction } from "../app/actions/rooms";
import { btnPrimary, btnSecondary } from "../lib/ui";

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
