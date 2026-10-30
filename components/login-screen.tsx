"use client";

import { useState } from "react";
import Link from "next/link";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { LoginCarousel } from "@/components/login-carousel";

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
    const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
    const redirectTo = new URL("/auth/callback", configuredOrigin || window.location.origin);
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

  const message = error ?? (!configured ? "Supabase ist noch nicht konfiguriert." : null);

  return (
    <main className="relative flex min-h-dvh items-end overflow-hidden bg-stone-950 text-white">
      <LoginCarousel />
      <div className="pointer-events-none absolute inset-0 z-20 bg-gradient-to-t from-black/80 via-black/45 to-black/55" />
      <div className="relative z-30 mx-auto flex w-full max-w-lg flex-col gap-6 px-6 pt-[max(2.5rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))]">
        <div>
          <p className="text-sm font-medium tracking-wide text-white/80">Sicpic</p>
          <h1 className="mt-2 font-display text-4xl leading-tight tracking-tight sm:text-6xl">Urlaubs-Fotos an einem Ort</h1>
        </div>
        <div className="flex flex-col gap-3">
          {message ? <p className="text-sm text-white">{message}</p> : null}
          <button
            type="button"
            onClick={signIn}
            disabled={!configured || pending}
            className="flex h-12 items-center justify-center gap-3 rounded-full bg-white px-5 text-sm font-semibold text-stone-950 disabled:opacity-60"
          >
            <GoogleMark />
            {pending ? "Weiter zu Google…" : "Mit Google anmelden"}
          </button>
          <p className="text-center text-xs text-white/70">
            <Link href="/datenschutz" className="underline decoration-white/40 underline-offset-2">
              Datenschutz
            </Link>
            <span aria-hidden="true"> · </span>
            <Link href="/nutzungsbedingungen" className="underline decoration-white/40 underline-offset-2">
              Nutzungsbedingungen
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.6 9.2c0-.6-.1-1.2-.2-1.8H9v3.4h4.8a4.1 4.1 0 0 1-1.8 2.7v2.2h2.9c1.7-1.6 2.7-3.9 2.7-6.5z" />
      <path fill="#34A853" d="M9 18c2.4 0 4.5-.8 6-2.2l-2.9-2.2c-.8.6-1.9.9-3.1.9-2.4 0-4.4-1.6-5.1-3.8H.9v2.3A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.9 10.7A5.4 5.4 0 0 1 3.6 9c0-.6.1-1.2.3-1.7V5H.9A9 9 0 0 0 0 9c0 1.4.3 2.8.9 4l3-2.3z" />
      <path fill="#EA4335" d="M9 3.6c1.3 0 2.5.5 3.4 1.3l2.6-2.6A9 9 0 0 0 .9 5l3 2.3C4.6 5.2 6.6 3.6 9 3.6z" />
    </svg>
  );
}
