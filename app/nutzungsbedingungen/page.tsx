import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Nutzungsbedingungen" };

export default function TermsPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-6 px-6 py-12">
      <p className="text-xs font-semibold tracking-[0.22em] text-accent uppercase">Sicpic</p>
      <h1 className="font-display text-5xl tracking-tight">Nutzungsbedingungen</h1>
      <div className="space-y-4 text-base leading-relaxed text-muted">
        <p>Sicpic ist eine private Gruppe. Mitmachen kann nur, wer eingeladen ist.</p>
        <p>Hochgeladen werden nur eigene Fotos und Videos. Die Rechte daran müssen bei der Person liegen, die sie einstellt.</p>
        <p>Eine Admin-Person kann Mitglieder entfernen. Damit verschwinden auch deren Dateien aus der Gruppe.</p>
      </div>
      <p className="text-sm">
        <Link href="/datenschutz" className="font-semibold text-accent">
          Datenschutz
        </Link>
        <span className="text-muted"> · </span>
        <Link href="/" className="font-semibold text-accent">
          Zur Anmeldung
        </Link>
      </p>
    </main>
  );
}
