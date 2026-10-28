import { Suspense } from "react";
import type { Metadata } from "next";
import { PhotoGallery } from "@/components/photo-gallery";
import { requirePageMember } from "@/lib/auth";
import { listPhotoPage } from "@/lib/photo-service";

export const metadata: Metadata = { title: "Mein Ordner" };

export default function FolderPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Dein Ordner wird geladen…</p>}>
      <FolderLoader />
    </Suspense>
  );
}

async function FolderLoader() {
  await requirePageMember();
  const page = await listPhotoPage("mine", null);
  return (
    <PhotoGallery
      scope="mine"
      title="Mein Ordner"
      intro="Nur deine Fotos. Löschen geht nur hier."
      initial={page.photos}
      initialCursor={page.nextCursor}
      canDelete
    />
  );
}
