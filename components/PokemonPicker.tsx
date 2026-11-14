"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { parseNames } from "../lib/feed-parse";
import { searchPokemonNames } from "../lib/pokemon-search";
import { btnPrimary, btnSecondary, inputClass } from "../lib/ui";
import type { PokemonName } from "../lib/validation/pokemon";

export type SendOutcome =
  | { kind: "sent" }
  | { kind: "repeat"; message: string }
  | { kind: "error"; message: string }
  /** Too fast: the player must wait this many seconds (shown as a countdown on the button). */
  | { kind: "wait"; seconds: number };

/**
 * Search box (names only, ignores case/accents/dots/hyphens) plus the send button.
 * `onSend(id, confirmRepeat)` reports whether the attempt was sent, needs the "already tried" confirmation, or failed.
 */
export function PokemonPicker({
  disabled,
  cooldownSeconds,
  onSend,
  verb = "Enviar",
}: {
  disabled: boolean;
  /** Wait between attempts chosen by the admin: after a sent attempt the button counts down this long. */
  cooldownSeconds: number;
  onSend: (pokemonId: number, confirmRepeat: boolean) => Promise<SendOutcome>;
  /** Text of the main button (default "Enviar"). The admin uses it to pick a new secret. */
  verb?: string;
}) {
  const [names, setNames] = useState<PokemonName[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadTick, setLoadTick] = useState(0);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<PokemonName | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [repeatOf, setRepeatOf] = useState<PokemonName | null>(null);
  const [waitLeft, setWaitLeft] = useState(0);

  useEffect(() => {
    if (waitLeft <= 0) return;
    const timer = setTimeout(() => setWaitLeft((n) => n - 1), 1000);
    return () => clearTimeout(timer);
  }, [waitLeft]);

  useEffect(() => {
    let cancelled = false;
    setLoadFailed(false);
    fetch("/api/pokemon/names")
      .then((res) => (res.ok ? res.json() : null))
      .then((body: unknown) => {
        if (cancelled) return;
        const parsed = parseNames(body);
        if (parsed === null) setLoadFailed(true);
        else setNames(parsed);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [loadTick]);

  const results = useMemo(() => (names ? searchPokemonNames(names, query) : []), [names, query]);

  async function send(choice: PokemonName, confirmRepeat: boolean) {
    setPending(true);
    setMessage(null);
    try {
      const outcome = await onSend(choice.id, confirmRepeat);
      if (outcome.kind === "sent") {
        setQuery("");
        setSelected(null);
        setRepeatOf(null);
        setWaitLeft(cooldownSeconds);
      } else if (outcome.kind === "wait") {
        setRepeatOf(null);
        setWaitLeft(outcome.seconds);
      } else if (outcome.kind === "repeat") {
        setRepeatOf(choice); // ask before sending a Pokémon somebody already tried
        setMessage(outcome.message);
      } else {
        setRepeatOf(null);
        setMessage(outcome.message);
      }
    } catch {
      setMessage("No se pudo conectar. Revisa tu internet e intenta de nuevo.");
    } finally {
      setPending(false);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || disabled || waitLeft > 0 || repeatOf !== null) return;
    // Enter without a choice picks the first result, so it is quick on a phone keyboard.
    const choice = selected ?? results[0] ?? null;
    if (choice === null) return;
    void send(choice, false);
  }

  if (loadFailed) {
    return (
      <div role="alert" className="flex flex-col gap-2">
        <p className="text-sm text-red-400">No se pudo cargar la lista de Pokémon.</p>
        <button type="button" onClick={() => setLoadTick((n) => n + 1)} className={btnSecondary}>
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full flex-col gap-3 text-left">
      <label htmlFor="pokemon-search" className="text-sm text-ec-muted">
        Busca un Pokémon por su nombre
      </label>
      <input
        id="pokemon-search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setSelected(null);
          setRepeatOf(null);
          setMessage(null);
        }}
        disabled={disabled || names === null}
        autoComplete="off"
        autoCapitalize="none"
        enterKeyHint="send"
        className={inputClass}
        placeholder={names === null ? "Cargando lista..." : "Ej: Pikachu"}
        aria-describedby={message ? "pokemon-message" : undefined}
      />
      {query.trim() !== "" && selected === null ? (
        results.length > 0 ? (
          <ul aria-label="Resultados de la búsqueda" className="flex flex-col gap-1">
            {results.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setSelected(p)}
                  className="min-h-12 w-full rounded-xl bg-ec-surface px-4 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ec-primary"
                >
                  {p.nombre_es}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ec-muted">No hay ningún Pokémon con ese nombre.</p>
        )
      ) : null}
      {selected ? (
        <p aria-live="polite" className="text-sm">
          Elegiste: <strong className="text-ec-primary">{selected.nombre_es}</strong>
        </p>
      ) : null}
      {message ? (
        <p id="pokemon-message" role="alert" className={repeatOf ? "text-sm text-ec-primary" : "text-sm text-red-400"}>
          {message}
        </p>
      ) : null}
      {repeatOf ? (
        <div role="group" aria-label="Confirmar intento repetido" className="flex flex-col gap-2">
          <button type="button" disabled={pending || waitLeft > 0} onClick={() => void send(repeatOf, true)} className={btnPrimary}>
            {pending ? "Enviando..." : waitLeft > 0 ? `Espera ${waitLeft} s` : `Enviar ${repeatOf.nombre_es} de todos modos`}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setRepeatOf(null);
              setMessage(null);
              setSelected(null);
            }}
            className={btnSecondary}
          >
            Elegir otro
          </button>
        </div>
      ) : (
      <button
        type="submit"
        disabled={disabled || pending || waitLeft > 0 || (selected === null && results.length === 0)}
        className={btnPrimary}
      >
        {pending ? "Enviando..." : waitLeft > 0 ? `Espera ${waitLeft} s` : selected ? `${verb} ${selected.nombre_es}` : verb}
      </button>
      )}
    </form>
  );
}
