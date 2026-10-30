"use client";

import { useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/browser";

export function InviteAccept({ token, e2e }: { token: string; e2e: boolean }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setPending(true);
    setError(null);
    const prepared = await fetch("/api/invites/prepare", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ token }),
    });
    if (!prepared.ok) {
      const payload = (await prepared.json().catch(() => null)) as { message?: string } | null;
      setPending(false);
      setError(payload?.message ?? "Diese Einladung ist nicht gültig.");
      return;
    }
    if (e2e) {
      const form = document.createElement("form");
      form.method = "get";
      form.action = "/auth/callback";
      for (const [name, value] of [
        ["e2e", "1"],
        ["next", "/gruppe"],
      ] as const) {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = name;
        input.value = value;
        form.append(input);
      }
      document.body.append(form);
      form.submit();
      return;
    }
    const supabase = createBrowserSupabase();
    if (!supabase) {
      setPending(false);
      setError("Supabase ist noch nicht konfiguriert.");
      return;
    }
    const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
    const redirectTo = new URL("/auth/callback", configuredOrigin || window.location.origin);
    redirectTo.searchParams.set("next", "/gruppe");
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
    <div className="flex flex-col gap-3">
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <button
        type="button"
        onClick={() => void signIn()}
        disabled={pending}
        className="flex h-12 items-center justify-center gap-3 rounded-full bg-white px-5 text-sm font-semibold text-stone-950 disabled:opacity-60"
      >
        <GoogleMark />
        {pending ? "Weiter zu Google…" : "Mit Google anmelden"}
      </button>
    </div>
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
