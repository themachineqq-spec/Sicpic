"use client";

import { useRouter } from "next/navigation";

export function SignOutButton() {
  const router = useRouter();

  async function signOut() {
    await fetch("/auth/signout", { method: "POST" });
    router.replace("/");
    router.refresh();
  }

  return (
    <button type="button" onClick={signOut} className="w-fit rounded-full bg-foreground px-5 py-3 text-sm font-semibold text-background">
      Abmelden
    </button>
  );
}
