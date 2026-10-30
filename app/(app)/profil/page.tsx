import type { Metadata } from "next";
import { ProfileForm } from "@/components/profile-form";
import { requirePageMember } from "@/lib/auth";

export const metadata: Metadata = { title: "Profil" };

export default async function ProfilePage() {
  const member = await requirePageMember();
  return (
    <section className="space-y-6">
      <div>
        <h1 className="font-display text-4xl tracking-tight">Profil</h1>
        <p className="mt-1 text-sm text-muted">Deine Google-Adresse bleibt, den Namen kannst du selbst setzen.</p>
      </div>
      <ProfileForm email={member.email} displayName={member.displayName} />
    </section>
  );
}
