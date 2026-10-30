"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { formatPhotoTime } from "@/lib/dates";
import type { FeedbackItem, FeedbackKind, FeedbackStatus } from "@/lib/types";

const kindLabel: Record<FeedbackKind, string> = { bug: "Fehler", feature: "Wunsch" };
const statusLabel: Record<FeedbackStatus, string> = {
  neu: "Neu",
  in_arbeit: "In Arbeit",
  erledigt: "Erledigt",
};

export function AdminFeedback({
  items,
  kind,
  status,
}: {
  items: FeedbackItem[];
  kind: string;
  status: string;
}) {
  return (
    <section className="space-y-5">
      <div>
        <h1 className="font-display text-4xl tracking-tight">Rückmeldungen</h1>
        <p className="mt-1 text-sm text-muted">Nur für Admins. Status lässt sich direkt setzen.</p>
      </div>
      <div className="flex flex-wrap gap-2 text-sm">
        <Filter href="/verwaltung/rueckmeldungen" active={!kind && !status} label="Alle" />
        <Filter href="/verwaltung/rueckmeldungen?kind=bug" active={kind === "bug"} label="Fehler" />
        <Filter href="/verwaltung/rueckmeldungen?kind=feature" active={kind === "feature"} label="Wünsche" />
        <Filter href="/verwaltung/rueckmeldungen?status=neu" active={status === "neu"} label="Neu" />
        <Filter href="/verwaltung/rueckmeldungen?status=in_arbeit" active={status === "in_arbeit"} label="In Arbeit" />
        <Filter href="/verwaltung/rueckmeldungen?status=erledigt" active={status === "erledigt"} label="Erledigt" />
        <Filter href="/verwaltung/mitglieder" active={false} label="Mitglieder" />
      </div>
      {items.length === 0 ? <p className="text-sm text-muted">Keine Einträge für diesen Filter.</p> : null}
      <ul className="space-y-3">
        {items.map((item) => (
          <FeedbackCard key={item.id} item={item} />
        ))}
      </ul>
    </section>
  );
}

function Filter({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <a href={href} className={`rounded-full px-3 py-1.5 ${active ? "bg-accent text-accent-ink" : "bg-card ring-1 ring-line"}`}>
      {label}
    </a>
  );
}

function FeedbackCard({ item }: { item: FeedbackItem }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [shot, setShot] = useState<string | null>(null);

  async function changeStatus(status: FeedbackStatus) {
    setError(null);
    try {
      await api(`/api/feedback/${item.id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Status nicht gespeichert.");
    }
  }

  async function showShot() {
    setError(null);
    try {
      const result = await api<{ url: string }>(`/api/feedback/${item.id}/url`);
      setShot(result.url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Screenshot nicht verfügbar.");
    }
  }

  return (
    <li className="rounded-3xl bg-card p-4 ring-1 ring-line">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-wide text-accent uppercase">{kindLabel[item.kind]}</p>
          <h2 className="mt-1 text-lg font-semibold">{item.title}</h2>
        </div>
        <select
          aria-label={`Status von ${item.title}`}
          value={item.status}
          onChange={(event) => void changeStatus(event.target.value as FeedbackStatus)}
          className="rounded-full bg-background px-3 py-2 text-sm ring-1 ring-line"
        >
          {Object.entries(statusLabel).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <p className="mt-3 text-sm whitespace-pre-wrap">{item.body}</p>
      <p className="mt-3 text-xs text-muted">
        {item.authorName} · {formatPhotoTime(item.createdAt)}
      </p>
      {item.hasScreenshot ? (
        <button type="button" onClick={() => void showShot()} className="mt-3 text-sm font-semibold text-accent">
          Screenshot anzeigen
        </button>
      ) : null}
      {shot ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={shot} alt="Screenshot zur Rückmeldung" className="mt-3 max-h-80 rounded-2xl" />
      ) : null}
      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
    </li>
  );
}
