"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-4 px-6">
      <h1 className="font-display text-4xl">Das hat nicht geklappt</h1>
      <p className="text-muted">Bitte versuch es noch einmal. Wenn es bleibt, schreib uns über den Feedback-Tab, sobald du wieder drin bist.</p>
      {error.digest ? <p className="text-xs text-muted">Referenz {error.digest}</p> : null}
      <button type="button" onClick={reset} className="w-fit rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-ink">
        Nochmal versuchen
      </button>
    </main>
  );
}
