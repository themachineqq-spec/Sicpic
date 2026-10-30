"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { invalidateSessionCache } from "@/lib/session-cache";

export function ProfileForm({ email, displayName }: { email: string; displayName: string }) {
  const router = useRouter();
  const [name, setName] = useState(displayName);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setSaved(false);
    try {
      const result = await api<{ member: { displayName: string } }>("/api/me", {
        method: "PATCH",
        body: JSON.stringify({ displayName: name }),
      });
      setName(result.member.displayName);
      invalidateSessionCache("gallery:");
      invalidateSessionCache("members");
      setSaved(true);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Der Anzeigename konnte nicht gespeichert werden.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(event) => void save(event)} className="space-y-4 rounded-3xl bg-card p-4 ring-1 ring-line">
      <label className="block text-sm font-medium">
        E-Mail
        <input
          readOnly
          value={email}
          aria-label="E-Mail"
          className="mt-1 w-full rounded-2xl bg-background px-4 py-3 text-muted ring-1 ring-line outline-none"
        />
      </label>
      <label className="block text-sm font-medium">
        Anzeigename
        <input
          required
          minLength={1}
          maxLength={80}
          value={name}
          aria-label="Anzeigename"
          onChange={(event) => {
            setName(event.target.value);
            setSaved(false);
          }}
          className="mt-1 w-full rounded-2xl bg-background px-4 py-3 ring-1 ring-line outline-none"
        />
      </label>
      <p className="text-sm text-muted">So heißt du in der Gruppe, im Ordner und in den Rückmeldungen.</p>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {saved ? <p className="text-sm text-ok">Gespeichert.</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-ink disabled:opacity-50"
      >
        {pending ? "Wird gespeichert…" : "Speichern"}
      </button>
    </form>
  );
}
