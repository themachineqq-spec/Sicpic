export function InviteInvalid({ limited = false }: { limited?: boolean }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-6 px-6">
      <p className="text-xs font-semibold tracking-[0.22em] text-accent uppercase">Sicpic</p>
      <h1 className="font-display text-5xl tracking-tight">Einladung ungültig</h1>
      <p className="text-lg text-muted">
        {limited
          ? "Zu viele Versuche. Bitte warte einen Moment."
          : "Dieser Link ist nicht gültig. Bitte die Admin-Person um eine neue Einladung."}
      </p>
    </main>
  );
}
