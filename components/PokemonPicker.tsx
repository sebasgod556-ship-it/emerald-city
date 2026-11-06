"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { parseNames } from "../lib/feed-parse";
import { searchPokemonNames } from "../lib/pokemon-search";
import { btnPrimary, btnSecondary, inputClass } from "../lib/ui";
import type { PokemonName } from "../lib/validation/pokemon";

/**
 * Search box (names only, ignores case/accents/dots/hyphens) plus the send button.
 * `onSend` returns an error message to show, or null when the attempt was accepted.
 */
export function PokemonPicker({
  disabled,
  onSend,
}: {
  disabled: boolean;
  onSend: (pokemonId: number) => Promise<string | null>;
}) {
  const [names, setNames] = useState<PokemonName[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadTick, setLoadTick] = useState(0);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<PokemonName | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

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

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || disabled) return;
    // Enter without a choice picks the first result, so it is quick on a phone keyboard.
    const choice = selected ?? results[0] ?? null;
    if (choice === null) return;
    setPending(true);
    setMessage(null);
    try {
      const error = await onSend(choice.id);
      if (error === null) {
        setQuery("");
        setSelected(null);
      } else {
        setMessage(error);
      }
    } catch {
      setMessage("No se pudo conectar. Revisa tu internet e intenta de nuevo.");
    } finally {
      setPending(false);
    }
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
    <form onSubmit={(e) => void onSubmit(e)} className="flex w-full flex-col gap-3 text-left">
      <label htmlFor="pokemon-search" className="text-sm text-ec-muted">
        Busca un Pokémon por su nombre
      </label>
      <input
        id="pokemon-search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setSelected(null);
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
        <p id="pokemon-message" role="alert" className="text-sm text-red-400">
          {message}
        </p>
      ) : null}
      <button type="submit" disabled={disabled || pending || (selected === null && results.length === 0)} className={btnPrimary}>
        {pending ? "Enviando..." : selected ? `Enviar ${selected.nombre_es}` : "Enviar"}
      </button>
    </form>
  );
}
