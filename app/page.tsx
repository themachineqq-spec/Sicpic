import { Suspense } from "react";
import { redirect } from "next/navigation";
import { LoginScreen } from "@/components/login-screen";
import { getRequestAccess } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/config";

export default function Page({
  searchParams,
}: {
  searchParams: Promise<{ fehler?: string; next?: string }>;
}) {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-stone-950" />}>
      <HomeGate searchParams={searchParams} />
    </Suspense>
  );
}

async function HomeGate({
  searchParams,
}: {
  searchParams: Promise<{ fehler?: string; next?: string }>;
}) {
  const params = await searchParams;
  const notice =
    params.fehler === "anmeldung"
      ? "Die Anmeldung hat nicht geklappt. Bitte noch einmal versuchen."
      : params.fehler === "config"
        ? "Die Server-Konfiguration ist unvollständig."
        : null;

  if (!isSupabaseConfigured()) {
    return <LoginScreen configured={false} notice={notice} />;
  }

  const access = await getRequestAccess();
  if (access.member) redirect("/gruppe");
  if (access.session) redirect("/nicht-eingeladen");
  return <LoginScreen configured notice={notice} />;
}
