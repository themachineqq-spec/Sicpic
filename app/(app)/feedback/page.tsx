import type { Metadata } from "next";
import { FeedbackForm } from "@/components/feedback-form";

export const metadata: Metadata = { title: "Rückmeldung" };

export default function FeedbackPage() {
  return <FeedbackForm />;
}
