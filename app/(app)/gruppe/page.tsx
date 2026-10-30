import { Suspense } from "react";
import type { Metadata } from "next";
import { PhotoGallery } from "@/components/photo-gallery";
import { requirePageMember } from "@/lib/auth";
import { listPhotoPage } from "@/lib/photo-service";

export const metadata: Metadata = { title: "Gruppe" };

export default function GroupPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Fotos werden geladen…</p>}>
      <GroupLoader />
    </Suspense>
  );
}

async function GroupLoader() {
  await requirePageMember();
  const page = await listPhotoPage("group", null);
  return (
    <PhotoGallery
      scope="group"
      title="Gruppe"
      intro="Fotos und Videos, neueste Aufnahme zuerst. Ohne Datum in der Datei zählt der Upload."
      initial={page.photos}
      initialCursor={page.nextCursor}
      canDelete={false}
    />
  );
}
