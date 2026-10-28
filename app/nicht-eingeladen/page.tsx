import type { Metadata } from "next";
import { SignOutButton } from "@/components/sign-out-button";

export const metadata: Metadata = { title: "Nicht eingeladen" };

export default function NotInvitedPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-6 px-6">
      <p className="text-xs font-semibold tracking-[0.22em] text-accent uppercase">Sicpic</p>
      <h1 className="font-display text-5xl tracking-tight">Nicht eingeladen</h1>
      <p className="text-lg text-muted">
        Diese Google-Adresse steht nicht auf der Liste. Bitte die Admin-Person, dich hinzuzufügen, und melde dich danach erneut an.
      </p>
      <SignOutButton />
    </main>
  );
}
