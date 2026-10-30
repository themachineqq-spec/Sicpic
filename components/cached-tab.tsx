"use client";

import { usePathname } from "next/navigation";
import { galleryCacheKey } from "@/lib/gallery-filters";
import { readSessionCache } from "@/lib/session-cache";
import type { GalleryPhoto } from "@/lib/types";

export function CachedTab() {
  const pathname = usePathname();
  const scope = pathname.startsWith("/ordner") ? "mine" : pathname.startsWith("/gruppe") ? "group" : null;
  const cached = scope
    ? readSessionCache<{ photos: GalleryPhoto[]; nextCursor: string | null }>(galleryCacheKey(scope))
    : null;
  const photos = cached?.data.photos?.slice(0, 12) ?? [];
  const title = scope === "mine" ? "Mein Ordner" : scope === "group" ? "Gruppe" : "Sicpic";
  return (
    <section>
      <h1 className="font-display text-4xl tracking-tight">{title}</h1>
      {photos.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Wird geladen…</p>
      ) : (
        <ul className="mt-6 grid grid-cols-3 gap-1 sm:grid-cols-4">
          {photos.map((photo) => (
            <li key={photo.id} className="aspect-square overflow-hidden bg-line">
              {photo.thumbUrl ? (
                // Cached thumbs are already private presigned URLs. They are not rewritten by the optimizer.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photo.thumbUrl} alt="" className="h-full w-full object-cover" />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
