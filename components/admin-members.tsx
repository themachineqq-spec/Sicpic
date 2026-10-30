"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import type { Member, MemberRole, OpenInvite } from "@/lib/types";

export function AdminMembers({
  members,
  invites,
  selfId,
}: {
  members: Member[];
  invites: OpenInvite[];
  selfId: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<MemberRole>("member");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<MemberRole>("member");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteNotice, setInviteNotice] = useState<string | null>(null);
  const [invitePending, setInvitePending] = useState(false);

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

  async function shareLink(url: string) {
    const payload = { title: "Sicpic", text: "Du wurdest zu Sicpic eingeladen", url };
    if (typeof navigator.share === "function") {
      try {
        await navigator.share(payload);
        setInviteNotice(null);
        return;
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setInviteNotice("Link kopiert.");
    } catch {
      setInviteNotice("Link steht unten. Teilen war nicht möglich.");
    }
  }

  async function createInvite() {
    setInvitePending(true);
    setError(null);
    setInviteNotice(null);
    try {
      const created = await api<{ invite: { url: string } }>("/api/invites", {
        method: "POST",
        body: JSON.stringify({
          displayName: inviteName.trim() || undefined,
          role: inviteRole,
        }),
      });
      setInviteLink(created.invite.url);
      setInviteName("");
      setInviteRole("member");
      void shareLink(created.invite.url);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Einladungslink fehlgeschlagen.");
    } finally {
      setInvitePending(false);
    }
  }

  async function revokeInvite(id: string) {
    setError(null);
    try {
      await api(`/api/invites/${id}`, { method: "DELETE" });
      if (inviteLink) setInviteNotice(null);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Zurückziehen fehlgeschlagen.");
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
      <section className="space-y-3 rounded-3xl bg-card p-4 ring-1 ring-line">
        <div>
          <h2 className="font-display text-2xl tracking-tight">Einladungslink</h2>
          <p className="mt-1 text-sm text-muted">Ein Link, sieben Tage, eine Person. Der Link wird nur einmal angezeigt.</p>
        </div>
        <label className="block text-sm font-medium">
          Name auf dem Link, optional
          <input
            value={inviteName}
            onChange={(event) => setInviteName(event.target.value)}
            maxLength={80}
            className="mt-1 w-full rounded-2xl bg-background px-4 py-3 ring-1 ring-line outline-none"
          />
        </label>
        <label className="block text-sm font-medium">
          Rolle für den Link
          <select
            value={inviteRole}
            onChange={(event) => setInviteRole(event.target.value as MemberRole)}
            className="mt-1 w-full rounded-2xl bg-background px-4 py-3 ring-1 ring-line"
          >
            <option value="member">Mitglied</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        <button
          type="button"
          onClick={() => void createInvite()}
          disabled={invitePending}
          className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-ink disabled:opacity-50"
        >
          {invitePending ? "Wird erstellt…" : "Einladungslink erstellen"}
        </button>
        {inviteLink ? (
          <div className="space-y-2">
            <label className="block text-sm font-medium">
              Einladungslink
              <input
                readOnly
                value={inviteLink}
                aria-label="Einladungslink"
                data-invite-url={inviteLink}
                className="mt-1 w-full rounded-2xl bg-background px-4 py-3 text-sm ring-1 ring-line outline-none"
              />
            </label>
            <button type="button" onClick={() => void shareLink(inviteLink)} className="text-sm font-semibold text-accent">
              Teilen
            </button>
            {inviteNotice ? <p className="text-sm text-muted">{inviteNotice}</p> : null}
          </div>
        ) : null}
        <ul className="space-y-3">
          {invites.map((invite) => (
            <li key={invite.id} className="flex items-center justify-between gap-3 rounded-2xl bg-background px-3 py-3">
              <div>
                <p className="font-semibold">{invite.displayName ?? "Ohne Namen"}</p>
                <p className="text-sm text-muted">
                  {invite.role === "admin" ? "Admin" : "Mitglied"} · gültig bis {formatExpiry(invite.expiresAt)}
                </p>
              </div>
              <button type="button" onClick={() => void revokeInvite(invite.id)} className="text-sm font-semibold text-danger">
                Zurückziehen
              </button>
            </li>
          ))}
        </ul>
      </section>
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

function formatExpiry(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unbekannt";
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  }).format(date);
}
