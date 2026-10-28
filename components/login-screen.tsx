"use client";

import { useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/browser";

export function LoginScreen({
  configured,
  notice,
}: {
  configured: boolean;
  notice?: string | null;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(notice ?? null);

  async function signIn() {
    const supabase = createBrowserSupabase();
    if (!supabase) {
      setError("Supabase ist noch nicht konfiguriert.");
      return;
    }
    setPending(true);
    setError(null);
    const next = new URLSearchParams(window.location.search).get("next");
    const redirectTo = new URL("/auth/callback", window.location.origin);
    if (next && next.startsWith("/") && !next.startsWith("//")) {
      redirectTo.searchParams.set("next", next);
    }
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: redirectTo.toString(),
        queryParams: { prompt: "select_account" },
      },
    });
    if (authError) {
      setPending(false);
      setError("Die Anmeldung konnte nicht gestartet werden.");
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col justify-between gap-10 px-6 py-10 sm:justify-center">
      <p className="text-xs font-semibold tracking-[0.22em] text-accent uppercase">Privat</p>
      <div className="flex flex-col gap-8">
        <div>
          <h1 className="font-display text-6xl tracking-tight text-foreground">Sicpic</h1>
          <p className="mt-3 max-w-sm text-lg text-muted">Fotos nur für uns. Kein öffentlicher Link, keine fremden Augen.</p>
        </div>
        <ul className="space-y-3 text-sm text-foreground">
          <li className="rounded-2xl bg-card px-4 py-3 ring-1 ring-line">Eigener Ordner für deine Aufnahmen.</li>
          <li className="rounded-2xl bg-card px-4 py-3 ring-1 ring-line">Gemeinsame Chronik nach Aufnahmedatum.</li>
          <li className="rounded-2xl bg-card px-4 py-3 ring-1 ring-line">Nur eingeladene Google-Adressen kommen rein.</li>
        </ul>
      </div>
      <div className="flex flex-col gap-3">
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <button
          type="button"
          onClick={signIn}
          disabled={!configured || pending}
          className="flex h-12 items-center justify-center gap-3 rounded-full bg-foreground px-5 text-sm font-semibold text-background disabled:opacity-50"
        >
          <GoogleMark />
          {pending ? "Weiter zu Google…" : "Mit Google anmelden"}
        </button>
        {!configured ? (
          <p className="text-sm text-muted">Die App wartet noch auf die Zugangsdaten aus der README.</p>
        ) : (
          <p className="text-sm text-muted">Ohne Einladung bleibt die Tür zu.</p>
        )}
      </div>
    </main>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#fff" d="M17.6 9.2c0-.6-.1-1.2-.2-1.8H9v3.4h4.8a4.1 4.1 0 0 1-1.8 2.7v2.2h2.9c1.7-1.6 2.7-3.9 2.7-6.5z" />
      <path fill="#fff" d="M9 18c2.4 0 4.5-.8 6-2.2l-2.9-2.2c-.8.6-1.9.9-3.1.9-2.4 0-4.4-1.6-5.1-3.8H.9v2.3A9 9 0 0 0 9 18z" />
      <path fill="#fff" d="M3.9 10.7A5.4 5.4 0 0 1 3.6 9c0-.6.1-1.2.3-1.7V5H.9A9 9 0 0 0 0 9c0 1.4.3 2.8.9 4l3-2.3z" />
      <path fill="#fff" d="M9 3.6c1.3 0 2.5.5 3.4 1.3l2.6-2.6A9 9 0 0 0 .9 5l3 2.3C4.6 5.2 6.6 3.6 9 3.6z" />
    </svg>
  );
}
