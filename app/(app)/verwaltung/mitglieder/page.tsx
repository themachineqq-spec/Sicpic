import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminMembers } from "@/components/admin-members";
import { requirePageMember } from "@/lib/auth";
import { listMembers } from "@/lib/member-admin";

export const metadata: Metadata = { title: "Mitglieder" };

export default function MembersPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Mitglieder werden geladen…</p>}>
      <MembersLoader />
    </Suspense>
  );
}

async function MembersLoader() {
  const member = await requirePageMember();
  if (member.role !== "admin") redirect("/gruppe");
  const members = await listMembers();
  return <AdminMembers members={members} selfId={member.id} />;
}
