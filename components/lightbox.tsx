"use client";

import { useEffect, useRef, useState } from "react";
import { formatPhotoTime } from "@/lib/dates";
import type { GalleryPhoto } from "@/lib/types";

export function Lightbox({
  photos,
  index,
  src,
  error,
  onClose,
  onIndex,
  onRenew,
  onDownload,
}: {
  photos: GalleryPhoto[];
  index: number;
  src: string | null;
  error: string | null;
  onClose: () => void;
  onIndex: (index: number) => void;
  onRenew?: () => Promise<string | null>;
  onDownload?: () => Promise<string | null>;
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
        {photo.mediaType === "video" ? (
          <VideoFrame key={`${photo.id}-${src ?? ""}`} src={src} error={error} onRenew={onRenew} onDownload={onDownload} />
        ) : src ? (
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

function VideoFrame({
  src,
  error,
  onRenew,
  onDownload,
}: {
  src: string | null;
  error: string | null;
  onRenew?: () => Promise<string | null>;
  onDownload?: () => Promise<string | null>;
}) {
  const renewed = useRef(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [downloadHref, setDownloadHref] = useState<string | null>(null);

  async function fail(unsupported: boolean) {
    if (!unsupported && !renewed.current && onRenew) {
      renewed.current = true;
      const next = await onRenew().catch(() => null);
      if (next) return;
    }
    setBlocked(true);
    if (onDownload && !downloadHref) {
      const href = await onDownload().catch(() => null);
      if (href) setDownloadHref(href);
    }
  }

  if (!src && !blocked) return <p className="text-sm text-stone-300">{error ?? "Video wird geladen…"}</p>;
  if (blocked) {
    return (
      <div className="max-w-sm px-4 text-center">
        <p className="text-sm text-stone-100">Dieser Browser kann das Video nicht abspielen. Du kannst es herunterladen und lokal öffnen.</p>
        {downloadHref ? (
          <a href={downloadHref} className="mt-4 inline-flex rounded-full bg-white px-4 py-2 text-sm font-semibold text-stone-950">
            Herunterladen
          </a>
        ) : (
          <p className="mt-3 text-xs text-stone-400">Download wird vorbereitet…</p>
        )}
      </div>
    );
  }

  return (
    <video
      ref={videoRef}
      key={src}
      src={src ?? undefined}
      controls
      playsInline
      preload="metadata"
      className="max-h-full max-w-full"
      onError={() => {
        const unsupported = videoRef.current?.error?.code === 4;
        void fail(unsupported);
      }}
    />
  );
}
