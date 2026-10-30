import type { Metadata } from "next";
import { headers } from "next/headers";
import { InviteAccept } from "@/components/invite-accept";
import { InviteInvalid } from "@/components/invite-invalid";
import { isE2ERequest } from "@/lib/e2e-guard";
import { allowInviteAttempt, inviteIsOpen } from "@/lib/invite-service";

export const metadata: Metadata = { title: "Einladung" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const headerStore = await headers();
  if (!allowInviteAttempt(headerStore)) {
    return <InviteInvalid limited />;
  }
  let open = false;
  try {
    open = await inviteIsOpen(token.slice(0, 256));
  } catch {
    return <InviteInvalid />;
  }
  if (!open) return <InviteInvalid />;
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-6 px-6">
      <p className="text-xs font-semibold tracking-[0.22em] text-accent uppercase">Sicpic</p>
      <h1 className="font-display text-5xl tracking-tight">Du wurdest zu Sicpic eingeladen</h1>
      <p className="text-lg text-muted">Melde dich mit Google an. Danach bist du in der Gruppe und hast einen eigenen Ordner.</p>
      <InviteAccept token={token.slice(0, 256)} e2e={await isE2ERequest()} />
    </main>
  );
}
