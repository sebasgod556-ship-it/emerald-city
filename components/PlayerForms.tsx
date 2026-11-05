"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { joinRoomAction } from "../app/actions/players";
import { btnPrimary, btnSecondary, inputClass } from "../lib/ui";

// Polling (not Realtime) on purpose in Step 4: it spends none of the 100 messages/second budget.
// Phase 2 replaces it with batched Realtime broadcasts (see docs/CONTRACTS.md, section 13).
const POLL_INTERVAL_MS = 5000;
const MAX_FAILED_POLLS = 3;

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

function parseNicknames(body: unknown): string[] | null {
  if (typeof body !== "object" || body === null) return null;
  const data = (body as { data?: unknown }).data;
  if (typeof data !== "object" || data === null) return null;
  const players = (data as { players?: unknown }).players;
  if (!Array.isArray(players)) return null;
  const out: string[] = [];
  for (const item of players as unknown[]) {
    const nick = typeof item === "object" && item !== null ? (item as { nickname?: unknown }).nickname : undefined;
    if (typeof nick !== "string") return null;
    out.push(nick);
  }
  return out;
}

/** Room screen for a joined player: who is in, refreshed every 5 s while the tab is visible. */
export function PlayerLobby({
  roomCode,
  nickname,
  initialPlayers,
  maxPlayers,
}: {
  roomCode: string;
  nickname: string;
  initialPlayers: string[];
  maxPlayers: number;
}) {
  const router = useRouter();
  const [players, setPlayers] = useState(initialPlayers);
  const [unstable, setUnstable] = useState(false);
  const [halted, setHalted] = useState(false);

  useEffect(() => {
    if (halted) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;

    function schedule(delayMs: number) {
      timer = setTimeout(() => void poll(), delayMs);
    }

    async function poll() {
      if (cancelled) return;
      if (document.hidden) {
        schedule(POLL_INTERVAL_MS);
        return;
      }
      try {
        const res = await fetch(`/api/rooms/${roomCode}/players`, { cache: "no-store" });
        if (res.status === 401 || res.status === 404 || res.status === 409) {
          // Session lost or room closed: stop polling and let the server render the right screen.
          if (!cancelled) router.refresh();
          return;
        }
        const nicknames = res.ok ? parseNicknames(await res.json()) : null;
        if (nicknames === null) throw new Error("bad response");
        if (cancelled) return;
        failures = 0;
        setUnstable(false);
        setPlayers(nicknames);
        schedule(POLL_INTERVAL_MS);
      } catch {
        if (cancelled) return;
        failures += 1;
        setUnstable(true);
        if (failures >= MAX_FAILED_POLLS) {
          setHalted(true); // after 3 attempts show a manual retry button
          return;
        }
        schedule(POLL_INTERVAL_MS * 2 ** failures); // 10 s, then 20 s
      }
    }

    schedule(POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [roomCode, router, halted]);

  return (
    <div className="flex w-full flex-col gap-4 text-left">
      <h1 className="text-3xl font-bold text-ec-primary">Sala {roomCode}</h1>
      <p>
        Ya estás dentro como <strong>{nickname}</strong>. El juego empieza en el siguiente paso.
      </p>

      <section aria-labelledby="players-heading" className="flex flex-col gap-2 rounded-xl bg-ec-surface p-4">
        <h2 id="players-heading" className="font-semibold">
          Jugadores en la sala
        </h2>
        <p aria-live="polite" className="text-sm text-ec-muted">
          {players.length} de {maxPlayers}
        </p>
        <ul aria-label="Lista de jugadores" className="flex flex-col gap-1">
          {players.map((name) => (
            <li key={name} className={name === nickname ? "font-semibold text-ec-primary" : undefined}>
              {name}
              {name === nickname ? " (tú)" : ""}
            </li>
          ))}
        </ul>
      </section>

      {halted ? (
        <div role="alert" className="flex flex-col gap-2">
          <p className="text-sm text-red-400">No se pudo actualizar la lista. Revisa tu conexión.</p>
          <button type="button" onClick={() => setHalted(false)} className={btnSecondary}>
            Reintentar
          </button>
        </div>
      ) : unstable ? (
        <p className="text-sm text-ec-muted">Reconectando...</p>
      ) : null}
    </div>
  );
}
