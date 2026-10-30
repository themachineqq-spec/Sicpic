import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Datenschutz" };

export default function PrivacyPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col gap-6 px-6 py-12">
      <p className="text-xs font-semibold tracking-[0.22em] text-accent uppercase">Sicpic</p>
      <h1 className="font-display text-5xl tracking-tight">Datenschutz</h1>
      <div className="space-y-4 text-base leading-relaxed text-muted">
        <p>
          Sicpic ist eine private Fotogruppe. Es gibt kein öffentliches Profil und keine öffentlichen Bildlinks.
        </p>
        <p>
          Die Anmeldung läuft über Google. Dabei werden nur Name und E-Mail-Adresse übernommen, nicht das Google-Passwort und keine weiteren Google-Daten.
        </p>
        <p>
          Name, E-Mail und die Liste der Fotos liegen bei Supabase. Die Dateien selbst liegen in einem privaten Cloudflare-R2-Speicher in der EU. Die Website wird bei Netlify ausgeliefert. Diese Dienste arbeiten nur, damit Anmeldung und Anzeige funktionieren. Eine Weitergabe zu Werbezwecken gibt es nicht.
        </p>
        <p>
          Es gibt keine Tracker und keine Analyse-Cookies. Gespeichert wird nur die Sitzung, die für die Anmeldung nötig ist.
        </p>
        <p>
          Wer aus der Gruppe gelöscht werden möchte, schreibt an{" "}
          <a className="font-semibold text-accent" href="mailto:themachineqq@gmail.com">
            themachineqq@gmail.com
          </a>
          . Dann werden Konto und Dateien entfernt.
        </p>
      </div>
      <p className="text-sm">
        <Link href="/nutzungsbedingungen" className="font-semibold text-accent">
          Nutzungsbedingungen
        </Link>
        <span className="text-muted"> · </span>
        <Link href="/" className="font-semibold text-accent">
          Zur Anmeldung
        </Link>
      </p>
    </main>
  );
}
