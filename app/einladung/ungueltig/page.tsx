import type { Metadata } from "next";
import { InviteInvalid } from "@/components/invite-invalid";

export const metadata: Metadata = { title: "Einladung ungültig" };

export default function InvalidInvitePage() {
  return <InviteInvalid />;
}
