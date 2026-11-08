"use client";

import { useState, type FormEvent } from "react";
import type { ChatMessage } from "../lib/feed-types";
import { btnPrimary, inputClass } from "../lib/ui";
import { CHAT_MAX_LENGTH } from "../lib/validation/chat";

/** Conversation chat (separate from the attempts). Newest message first. React escapes the text. */
export function ChatPanel({
  messages,
  mine,
  onSend,
}: {
  messages: ChatMessage[];
  /** Nickname of the viewer, or null for the admin (their messages come flagged as admin). */
  mine: string | null;
  /** Returns an error message to show, or null when the message was accepted. */
  onSend: (body: string) => Promise<string | null>;
}) {
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const newestFirst = [...messages].reverse();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || text.trim() === "") return;
    setPending(true);
    setMessage(null);
    try {
      const error = await onSend(text);
      if (error === null) setText("");
      else setMessage(error);
    } catch {
      setMessage("No se pudo conectar. Revisa tu internet e intenta de nuevo.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section aria-label="Chat de la sala" className="flex flex-col gap-2">
      <h2 className="font-semibold">Chat</h2>
      <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-2">
        <label htmlFor="chat-text" className="text-sm text-ec-muted">
          Escribe un mensaje
        </label>
        <input
          id="chat-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={CHAT_MAX_LENGTH}
          autoComplete="off"
          enterKeyHint="send"
          className={inputClass}
          aria-describedby={message ? "chat-message" : undefined}
        />
        {message ? (
          <p id="chat-message" role="alert" className="text-sm text-red-400">
            {message}
          </p>
        ) : null}
        <button type="submit" disabled={pending || text.trim() === ""} className={btnPrimary}>
          {pending ? "Enviando..." : "Enviar mensaje"}
        </button>
      </form>
      <div role="log" aria-label="Mensajes del chat" aria-live="polite">
        {newestFirst.length === 0 ? (
          <p className="text-sm text-ec-muted">Todavía no hay mensajes.</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {newestFirst.map((m) => (
              <li
                key={m.id}
                className={`rounded-xl bg-ec-surface p-3 ${m.isAdmin || m.nickname === mine ? "border border-ec-primary" : ""}`}
              >
                <strong>{m.isAdmin ? "Admin" : m.nickname}</strong>
                {m.isAdmin ? <span className="text-ec-muted"> (administrador)</span> : null}: {m.body}
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
