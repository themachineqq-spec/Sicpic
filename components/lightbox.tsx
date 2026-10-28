"use client";

import { useEffect } from "react";
import { formatPhotoTime } from "@/lib/dates";
import type { GalleryPhoto } from "@/lib/types";

export function Lightbox({
  photos,
  index,
  src,
  error,
  onClose,
  onIndex,
}: {
  photos: GalleryPhoto[];
  index: number;
  src: string | null;
  error: string | null;
  onClose: () => void;
  onIndex: (index: number) => void;
}) {
  const photo = photos[index];

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight") onIndex(Math.min(photos.length - 1, index + 1));
      if (event.key === "ArrowLeft") onIndex(Math.max(0, index - 1));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, onClose, onIndex, photos.length]);

  if (!photo) return null;

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-stone-950/95 text-stone-50" role="dialog" aria-modal="true" aria-label={photo.filename}>
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div>
          <p className="text-sm font-semibold">{photo.uploaderName}</p>
          <p className="text-xs text-stone-300">{formatPhotoTime(photo.capturedAt)}</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-full bg-white/10 px-4 py-2 text-sm">
          Schließen
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center px-3">
        {src ? (
          // Presigned URLs expire and must not pass through the image optimizer.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={photo.filename} className="max-h-full max-w-full object-contain" />
        ) : (
          <p className="text-sm text-stone-300">{error ?? "Bild wird geladen…"}</p>
        )}
      </div>
      <div className="flex justify-between px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <button type="button" disabled={index === 0} onClick={() => onIndex(index - 1)} className="rounded-full px-4 py-2 text-sm disabled:opacity-30">
          Zurück
        </button>
        <p className="text-xs text-stone-400">
          {index + 1} / {photos.length}
        </p>
        <button
          type="button"
          disabled={index >= photos.length - 1}
          onClick={() => onIndex(index + 1)}
          className="rounded-full px-4 py-2 text-sm disabled:opacity-30"
        >
          Weiter
        </button>
      </div>
    </div>
  );
}
