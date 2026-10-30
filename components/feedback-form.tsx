"use client";

import { useState, type FormEvent } from "react";
import { api } from "@/lib/api-client";
import { putWithProgress } from "@/lib/browser-upload";
import type { FeedbackKind } from "@/lib/types";

export function FeedbackForm() {
  const [kind, setKind] = useState<FeedbackKind>("bug");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      let id = crypto.randomUUID();
      let screenshotContentType: string | null = null;
      if (file) {
        const grant = await api<{ feedbackId: string; url: string; contentType: string }>("/api/feedback/uploads", {
          method: "POST",
          body: JSON.stringify({ contentType: file.type || "image/jpeg" }),
        });
        await putWithProgress(grant.url, file, grant.contentType, () => undefined);
        id = grant.feedbackId;
        screenshotContentType = grant.contentType;
      }
      await api("/api/feedback", {
        method: "POST",
        body: JSON.stringify({ id, kind, title, body, screenshotContentType }),
      });
      setTitle("");
      setBody("");
      setFile(null);
      setMessage("Danke. Die Rückmeldung ist angekommen.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Senden fehlgeschlagen.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <h1 className="font-display text-4xl tracking-tight">Rückmeldung</h1>
        <p className="mt-1 text-sm text-muted">Fehler oder Wunsch. Optional mit Screenshot.</p>
      </div>
      <fieldset className="grid grid-cols-2 gap-2">
        {(
          [
            ["bug", "Fehler"],
            ["feature", "Wunsch"],
          ] as const
        ).map(([value, label]) => (
          <label key={value} className={`rounded-2xl px-4 py-3 text-center text-sm font-semibold ring-1 ring-line ${kind === value ? "bg-accent text-accent-ink" : "bg-card"}`}>
            <input type="radio" name="kind" value={value} checked={kind === value} onChange={() => setKind(value)} className="sr-only" />
            {label}
          </label>
        ))}
      </fieldset>
      <label className="block text-sm font-medium">
        Titel
        <input
          required
          minLength={3}
          maxLength={120}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          className="mt-1 w-full rounded-2xl bg-card px-4 py-3 ring-1 ring-line outline-none"
        />
      </label>
      <label className="block text-sm font-medium">
        Beschreibung
        <textarea
          required
          minLength={5}
          maxLength={4000}
          rows={6}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          className="mt-1 w-full rounded-2xl bg-card px-4 py-3 ring-1 ring-line outline-none"
        />
      </label>
      <label className="block text-sm font-medium">
        Screenshot, optional
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          className="mt-1 block w-full text-sm"
        />
      </label>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {message ? <p className="text-sm text-ok">{message}</p> : null}
      <button type="submit" disabled={pending} className="rounded-full bg-foreground px-5 py-3 text-sm font-semibold text-background disabled:opacity-50">
        {pending ? "Wird gesendet…" : "Senden"}
      </button>
    </form>
  );
}
