"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { createRoomAction, loginAdminAction } from "../app/actions/rooms";
import { searchPokemonNames } from "../lib/pokemon-search";
import { extractRoomCode, formatAdminCode } from "../lib/room-codes";
import { btnPrimary, btnSecondary, inputClass } from "../lib/ui";
import type { PokemonName } from "../lib/validation/pokemon";
import {
  DEFAULT_COOLDOWN_SECONDS,
  DEFAULT_WAIT_MINUTES,
  DEFAULT_TURN_SECONDS,
  MAX_COOLDOWN_SECONDS,
  MAX_TURN_SECONDS,
  MAX_WAIT_MINUTES,
  MIN_COOLDOWN_SECONDS,
  MIN_TURN_SECONDS,
  MIN_WAIT_MINUTES,
} from "../lib/validation/rooms";

export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button type="button" onClick={() => void copy()} className={btnSecondary}>
      {copied ? "Copiado ✓" : label}
    </button>
  );
}

/** Home page: "Unirme" button that asks for a room code or a pasted link. */
export function JoinRoomForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = extractRoomCode(value);
    if (code.length !== 6) {
      setError("Revisa el código: tiene 6 letras y números.");
      return;
    }
    router.push(`/sala/${code}`);
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={btnSecondary}>
        Unirme a una sala
      </button>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full flex-col gap-3 text-left">
      <label htmlFor="join-code" className="text-sm text-ec-muted">
        Código o enlace de la sala
      </label>
      <input
        id="join-code"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setError(null);
        }}
        autoComplete="off"
        autoCapitalize="characters"
        className={inputClass}
        placeholder="Ej: ABC234"
      />
      {error ? (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      ) : null}
      <button type="submit" className={btnPrimary}>
        Entrar
      </button>
    </form>
  );
}

/** /crear: search the secret Pokémon by name, create the room, show link and admin code once. */
export function CreateRoomForm({ names }: { names: PokemonName[] }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<PokemonName | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ roomCode: string; adminCode: string; origin: string; waitMinutes: number } | null>(null);
  const [cooldown, setCooldown] = useState(String(DEFAULT_COOLDOWN_SECONDS));
  const [waitMinutes, setWaitMinutes] = useState(String(DEFAULT_WAIT_MINUTES));
  const [mode, setMode] = useState<"free" | "turns">("free");
  const [turnOrder, setTurnOrder] = useState<"random" | "arrival">("random");
  const [turnSeconds, setTurnSeconds] = useState(String(DEFAULT_TURN_SECONDS));
  const turnNumber = Number(turnSeconds);
  const turnValid =
    turnSeconds.trim() !== "" && Number.isInteger(turnNumber) && turnNumber >= MIN_TURN_SECONDS && turnNumber <= MAX_TURN_SECONDS;

  const cooldownNumber = Number(cooldown);
  const waitNumber = Number(waitMinutes);
  const cooldownValid =
    cooldown.trim() !== "" && Number.isInteger(cooldownNumber) && cooldownNumber >= MIN_COOLDOWN_SECONDS && cooldownNumber <= MAX_COOLDOWN_SECONDS;
  // Only the fields of the chosen mode have to be valid: the other ones are hidden and sent with their defaults.
  const waitValid =
    waitMinutes.trim() !== "" && Number.isInteger(waitNumber) && waitNumber >= MIN_WAIT_MINUTES && waitNumber <= MAX_WAIT_MINUTES;
  const formOk = waitValid && (mode === "turns" ? turnValid : cooldownValid);

  const results = useMemo(() => (selected ? [] : searchPokemonNames(names, query)), [names, query, selected]);

  async function onCreate() {
    if (!selected || pending || !formOk) return;
    setPending(true);
    setError(null);
    try {
      const res = await createRoomAction({
        pokemonId: selected.id,
        cooldownSeconds: cooldownValid ? cooldownNumber : DEFAULT_COOLDOWN_SECONDS,
        waitMinutes: waitNumber,
        mode,
        turnOrder,
        turnSeconds: turnValid ? turnNumber : DEFAULT_TURN_SECONDS,
      });
      if (res.error) setError(res.error.message);
      else {
        setCreated({ roomCode: res.data.roomCode, adminCode: res.data.adminCode, origin: window.location.origin, waitMinutes: waitNumber });
      }
    } catch {
      setError("No se pudo conectar. Revisa tu internet e intenta de nuevo.");
    } finally {
      setPending(false);
    }
  }

  if (created) {
    const link = `${created.origin}/sala/${created.roomCode}`;
    const code = formatAdminCode(created.adminCode);
    return (
      <div className="flex w-full flex-col gap-4 text-left">
        <h2 className="text-2xl font-bold text-ec-primary">¡Sala creada!</h2>

        <section className="flex flex-col gap-2 rounded-xl bg-ec-surface p-4">
          <h3 className="font-semibold">Enlace para los jugadores</h3>
          <p className="break-all text-ec-muted">{link}</p>
          <CopyButton value={link} label="Copiar enlace" />
        </section>

        <section className="flex flex-col gap-2 rounded-xl border border-ec-primary p-4">
          <h3 className="font-semibold">Tu código de administrador</h3>
          <p className="text-2xl font-bold tracking-widest">{code}</p>
          <p className="text-sm text-ec-muted">
            Guárdalo ahora. Solo se muestra una vez y no se puede recuperar. Si lo pierdes, tendrás que crear otra sala.
          </p>
          <CopyButton value={code} label="Copiar código" />
        </section>

        <p className="text-sm text-ec-muted">
          {created.waitMinutes > 0
            ? `La sala está en sala de espera: la partida arranca sola en ${created.waitMinutes} min, o antes si pulsas "Empezar ya" en tu panel.`
            : "La sala no tiene sala de espera: los jugadores pueden adivinar desde que entran."}
        </p>

        <Link href={`/sala/${created.roomCode}/admin`} className={btnPrimary}>
          Ir al panel de administrador
        </Link>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-3 text-left">
      <label htmlFor="secret-search" className="text-sm text-ec-muted">
        Busca el Pokémon secreto
      </label>
      <input
        id="secret-search"
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setSelected(null);
          setError(null);
        }}
        autoComplete="off"
        className={inputClass}
        placeholder="Ej: Pikachu"
      />

      <p aria-live="polite" className="sr-only">
        {query && !selected ? `${results.length} resultados` : ""}
      </p>
      {results.length > 0 ? (
        <ul aria-label="Resultados de la búsqueda" className="flex flex-col gap-2">
          {results.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                className={btnSecondary}
                onClick={() => {
                  setSelected(p);
                  setQuery(p.nombre_es);
                }}
              >
                {p.nombre_es}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {query && !selected && results.length === 0 ? (
        <p className="text-sm text-ec-muted">No encontré ese Pokémon. Revisa el nombre.</p>
      ) : null}

      {selected ? (
        <p className="rounded-xl bg-ec-surface p-3">
          Pokémon secreto elegido: <strong>{selected.nombre_es}</strong>
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      ) : null}

      <details className="rounded-xl bg-ec-surface p-4">
        <summary className="cursor-pointer font-semibold">Opciones de la sala</summary>
        <div className="mt-3 flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="opt-mode" className="text-sm text-ec-muted">
              Modo de juego
            </label>
            <select
              id="opt-mode"
              value={mode}
              onChange={(e) => setMode(e.target.value === "turns" ? "turns" : "free")}
              className={inputClass}
            >
              <option value="free">Libre: todos envían a la vez</option>
              <option value="turns">Turnos: uno a la vez</option>
            </select>
          </div>
          {mode === "turns" ? (
            <>
              <div className="flex flex-col gap-1">
                <label htmlFor="opt-order" className="text-sm text-ec-muted">
                  Orden de los turnos
                </label>
                <select
                  id="opt-order"
                  value={turnOrder}
                  onChange={(e) => setTurnOrder(e.target.value === "arrival" ? "arrival" : "random")}
                  className={inputClass}
                >
                  <option value="random">Aleatorio</option>
                  <option value="arrival">Orden de llegada</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="opt-turn-seconds" className="text-sm text-ec-muted">
                  Segundos para responder en cada turno
                </label>
                <input
                  id="opt-turn-seconds"
                  type="number"
                  inputMode="numeric"
                  min={MIN_TURN_SECONDS}
                  max={MAX_TURN_SECONDS}
                  value={turnSeconds}
                  onChange={(e) => setTurnSeconds(e.target.value)}
                  aria-invalid={!turnValid}
                  className={inputClass}
                />
                {!turnValid ? (
                  <p role="alert" className="text-sm text-red-400">
                    Escribe un número de {MIN_TURN_SECONDS} a {MAX_TURN_SECONDS}.
                  </p>
                ) : null}
              </div>
            </>
          ) : null}
          {mode === "free" ? (
          <div className="flex flex-col gap-1">
            <label htmlFor="opt-cooldown" className="text-sm text-ec-muted">
              Espera entre intentos de cada jugador (segundos)
            </label>
            <input
              id="opt-cooldown"
              type="number"
              inputMode="numeric"
              min={MIN_COOLDOWN_SECONDS}
              max={MAX_COOLDOWN_SECONDS}
              value={cooldown}
              onChange={(e) => setCooldown(e.target.value)}
              aria-invalid={!cooldownValid}
              className={inputClass}
            />
            {!cooldownValid ? (
              <p role="alert" className="text-sm text-red-400">
                Escribe un número de {MIN_COOLDOWN_SECONDS} a {MAX_COOLDOWN_SECONDS}.
              </p>
            ) : null}
          </div>
          ) : null}
          <div className="flex flex-col gap-1">
            <label htmlFor="opt-wait" className="text-sm text-ec-muted">
              Minutos de sala de espera antes de empezar (0 = sin sala de espera)
            </label>
            <input
              id="opt-wait"
              type="number"
              inputMode="numeric"
              min={MIN_WAIT_MINUTES}
              max={MAX_WAIT_MINUTES}
              value={waitMinutes}
              onChange={(e) => setWaitMinutes(e.target.value)}
              aria-invalid={!waitValid}
              className={inputClass}
            />
            {!waitValid ? (
              <p role="alert" className="text-sm text-red-400">
                Escribe un número de {MIN_WAIT_MINUTES} a {MAX_WAIT_MINUTES}.
              </p>
            ) : null}
          </div>
        </div>
      </details>

      <button type="button" onClick={() => void onCreate()} disabled={!selected || pending || !formOk} className={btnPrimary}>
        {pending ? "Creando..." : error ? "Reintentar" : "Crear sala"}
      </button>
    </div>
  );
}

/** /sala/[roomCode]/admin when the browser is not recognised as the admin yet. */
export function AdminLoginForm({ roomCode }: { roomCode: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await loginAdminAction({ roomCode, adminCode: code });
      if (res.error) setError(res.error.message);
      else router.refresh();
    } catch {
      setError("No se pudo conectar. Revisa tu internet e intenta de nuevo.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="flex w-full flex-col gap-3 text-left">
      <label htmlFor="admin-code" className="text-sm text-ec-muted">
        Código de administrador (12 letras y números)
      </label>
      <input
        id="admin-code"
        value={code}
        onChange={(e) => {
          setCode(e.target.value);
          setError(null);
        }}
        autoComplete="off"
        autoCapitalize="characters"
        className={inputClass}
        placeholder="ABCD-EFGH-JKMN"
      />
      {error ? (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={pending || code.trim() === ""} className={btnPrimary}>
        {pending ? "Comprobando..." : "Entrar como administrador"}
      </button>
    </form>
  );
}
