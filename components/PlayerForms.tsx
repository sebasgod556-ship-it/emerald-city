"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { joinRoomAction } from "../app/actions/players";
import { btnPrimary, inputClass } from "../lib/ui";

/** /sala/[roomCode] before the browser has joined: asks for a nickname. */
export function JoinNicknameForm({ roomCode }: { roomCode: string }) {
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await joinRoomAction({ roomCode, nickname });
      if (res.error === null) {
        router.refresh();
        return;
      }
      if (res.error.code === "ROOM_CLOSED" || res.error.code === "NOT_FOUND") {
        router.refresh(); // the server renders the "room not available" screen
        return;
      }
      setError(res.error.message);
    } catch {
      setError("No se pudo conectar. Revisa tu internet e intenta de nuevo.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="flex w-full flex-col gap-3 text-left">
      <label htmlFor="nickname" className="text-sm text-ec-muted">
        Tu apodo
      </label>
      <input
        id="nickname"
        value={nickname}
        onChange={(e) => {
          setNickname(e.target.value);
          setError(null);
        }}
        maxLength={20}
        autoComplete="off"
        enterKeyHint="go"
        className={inputClass}
        placeholder="Ej: Ash"
        aria-describedby={error ? "nickname-hint nickname-error" : "nickname-hint"}
        aria-invalid={error ? true : undefined}
      />
      <p id="nickname-hint" className="text-sm text-ec-muted">
        De 2 a 20 caracteres: letras, números, espacios, punto, guion o guion bajo.
      </p>
      {error ? (
        <p id="nickname-error" role="alert" className="text-sm text-red-400">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={pending || nickname.trim() === ""} className={btnPrimary}>
        {pending ? "Entrando..." : "Entrar a la sala"}
      </button>
    </form>
  );
}
