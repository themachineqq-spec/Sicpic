"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import type { Member, MemberRole } from "@/lib/types";

export function AdminMembers({ members, selfId }: { members: Member[]; selfId: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<MemberRole>("member");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function add(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await api("/api/members", {
        method: "POST",
        body: JSON.stringify({ email, displayName, role }),
      });
      setEmail("");
      setDisplayName("");
      setRole("member");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Einladen fehlgeschlagen.");
    } finally {
      setPending(false);
    }
  }

  async function changeRole(id: string, nextRole: MemberRole) {
    setError(null);
    try {
      await api(`/api/members/${id}`, { method: "PATCH", body: JSON.stringify({ role: nextRole }) });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Rolle nicht gespeichert.");
    }
  }

  async function remove(member: Member) {
    if (!window.confirm(`${member.displayName} und alle eigenen Fotos entfernen?`)) return;
    setError(null);
    try {
      await api(`/api/members/${member.id}`, { method: "DELETE" });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Entfernen fehlgeschlagen.");
    }
  }

  return (
    <section className="space-y-6">
      <div>
        <h1 className="font-display text-4xl tracking-tight">Mitglieder</h1>
        <p className="mt-1 text-sm text-muted">Nur diese Google-Adressen können sich anmelden.</p>
        <a href="/verwaltung/rueckmeldungen" className="mt-3 inline-block text-sm font-semibold text-accent">
          Zu den Rückmeldungen
        </a>
      </div>
      <form onSubmit={add} className="space-y-3 rounded-3xl bg-card p-4 ring-1 ring-line">
        <label className="block text-sm font-medium">
          E-Mail
          <input
            required
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1 w-full rounded-2xl bg-background px-4 py-3 ring-1 ring-line outline-none"
            placeholder="name@example.com"
          />
        </label>
        <label className="block text-sm font-medium">
          Anzeigename, optional
          <input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            maxLength={80}
            className="mt-1 w-full rounded-2xl bg-background px-4 py-3 ring-1 ring-line outline-none"
          />
        </label>
        <label className="block text-sm font-medium">
          Rolle
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as MemberRole)}
            className="mt-1 w-full rounded-2xl bg-background px-4 py-3 ring-1 ring-line"
          >
            <option value="member">Mitglied</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <button type="submit" disabled={pending} className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-ink disabled:opacity-50">
          {pending ? "Wird gespeichert…" : "Zur Liste hinzufügen"}
        </button>
      </form>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <ul className="space-y-3">
        {members.map((member) => (
          <li key={member.id} className="rounded-3xl bg-card p-4 ring-1 ring-line">
            <p className="font-semibold">{member.displayName}</p>
            <p className="text-sm text-muted">{member.email}</p>
            <div className="mt-3 flex items-center justify-between gap-3">
              <select
                aria-label={`Rolle von ${member.displayName}`}
                value={member.role}
                onChange={(event) => void changeRole(member.id, event.target.value as MemberRole)}
                className="rounded-full bg-background px-3 py-2 text-sm ring-1 ring-line"
              >
                <option value="member">Mitglied</option>
                <option value="admin">Admin</option>
              </select>
              {member.id !== selfId ? (
                <button type="button" onClick={() => void remove(member)} className="text-sm font-semibold text-danger">
                  Entfernen
                </button>
              ) : (
                <span className="text-xs text-muted">Das bist du</span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
