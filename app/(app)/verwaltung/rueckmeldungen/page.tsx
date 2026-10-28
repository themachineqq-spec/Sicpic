import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminFeedback } from "@/components/admin-feedback";
import { requirePageMember } from "@/lib/auth";
import { listFeedback } from "@/lib/feedback-service";

export const metadata: Metadata = { title: "Rückmeldungen" };

export default function FeedbackAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; status?: string }>;
}) {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Rückmeldungen werden geladen…</p>}>
      <FeedbackAdminLoader searchParams={searchParams} />
    </Suspense>
  );
}

async function FeedbackAdminLoader({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; status?: string }>;
}) {
  const member = await requirePageMember();
  if (member.role !== "admin") redirect("/gruppe");
  const params = await searchParams;
  const items = await listFeedback({ kind: params.kind, status: params.status });
  return <AdminFeedback items={items} kind={params.kind ?? ""} status={params.status ?? ""} />;
}
