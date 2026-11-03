"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { createRoomAction, loginAdminAction } from "../app/actions/rooms";
import { searchPokemonNames } from "../lib/pokemon-search";
import { extractRoomCode, formatAdminCode } from "../lib/room-codes";
import { btnPrimary, btnSecondary, inputClass } from "../lib/ui";
import type { PokemonName } from "../lib/validation/pokemon";

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
  const [created, setCreated] = useState<{ roomCode: string; adminCode: string; origin: string } | null>(null);

  const results = useMemo(() => (selected ? [] : searchPokemonNames(names, query)), [names, query, selected]);

  async function onCreate() {
    if (!selected || pending) return;
    setPending(true);
    setError(null);
    try {
      const res = await createRoomAction({ pokemonId: selected.id });
      if (res.error) setError(res.error.message);
      else setCreated({ roomCode: res.data.roomCode, adminCode: res.data.adminCode, origin: window.location.origin });
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

      <button type="button" onClick={() => void onCreate()} disabled={!selected || pending} className={btnPrimary}>
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
