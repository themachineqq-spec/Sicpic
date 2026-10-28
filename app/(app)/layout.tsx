import { Suspense, type ReactNode } from "react";
import { AppShell, ShellFallback } from "@/components/app-shell";
import { requirePageMember } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/config";

export default function AppLayout({ children }: { children: ReactNode }) {
  if (!isSupabaseConfigured()) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-6">
        <h1 className="font-display text-4xl">Sicpic</h1>
        <p className="mt-3 text-muted">Supabase ist noch nicht konfiguriert. Die Schritte stehen in der README.</p>
      </main>
    );
  }

  return (
    <Suspense fallback={<ShellFallback />}>
      <AuthedShell>{children}</AuthedShell>
    </Suspense>
  );
}

async function AuthedShell({ children }: { children: ReactNode }) {
  const member = await requirePageMember();
  return <AppShell member={member}>{children}</AppShell>;
}
