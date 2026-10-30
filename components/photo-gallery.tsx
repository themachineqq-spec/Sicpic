"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";
import { groupPhotosByMonth, sortPhotosNewestFirst } from "@/lib/dates";
import type { GalleryPhoto, MediaFilter, PhotoScope } from "@/lib/types";
import { formatDuration } from "@/lib/video/time";
import { Lightbox } from "@/components/lightbox";
import { Uploader } from "@/components/uploader";

export function PhotoGallery({
  scope,
  title,
  intro,
  initial,
  initialCursor,
  canDelete,
}: {
  scope: PhotoScope;
  title: string;
  intro: string;
  initial: GalleryPhoto[];
  initialCursor: string | null;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [extra, setExtra] = useState<GalleryPhoto[]>([]);
  const [cursor, setCursor] = useState(initialCursor);
  const [hidden, setHidden] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<MediaFilter>("all");
  const [replaced, setReplaced] = useState<GalleryPhoto[] | null>(null);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [displayUrl, setDisplayUrl] = useState<string | null>(null);
  const [displayError, setDisplayError] = useState<string | null>(null);
  const sentinel = useRef<HTMLDivElement | null>(null);
  const displayRequest = useRef(0);

  const merged = new Map<string, GalleryPhoto>();
  for (const photo of initial) merged.set(photo.id, photo);
  for (const photo of extra) merged.set(photo.id, photo);
  const base = replaced ?? [...merged.values()];
  const photos = sortPhotosNewestFirst(base.filter((photo) => !hidden.includes(photo.id)));
  const groups = scope === "group" ? groupPhotosByMonth(photos) : [];

  async function loadMore() {
    if (!cursor || loading) return;
    setLoading(true);
    setError(null);
    try {
      const media = kind === "all" ? "" : `&media=${kind}`;
      const page = await api<{ photos: GalleryPhoto[]; nextCursor: string | null }>(
        `/api/photos?scope=${scope}&cursor=${encodeURIComponent(cursor)}${media}`,
      );
      if (replaced) setReplaced((current) => [...(current ?? []), ...page.photos]);
      else setExtra((current) => [...current, ...page.photos]);
      setCursor(page.nextCursor);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Weitere Fotos konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const node = sentinel.current;
    if (!node || !cursor || error) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadMore();
    });
    observer.observe(node);
    return () => observer.disconnect();
    // loadMore closes over cursor and loading; the observer is rebuilt when they change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor, loading, scope, error]);

  async function refreshThumb(photo: GalleryPhoto) {
    try {
      const result = await api<{ url: string }>(`/api/photos/${photo.id}/url?variant=thumb`);
      setExtra((current) => {
        const without = current.filter((item) => item.id !== photo.id);
        return [...without, { ...photo, thumbUrl: result.url }];
      });
    } catch {
      setError("Eine Vorschau ist abgelaufen und konnte nicht erneuert werden.");
    }
  }

  async function show(index: number) {
    const photo = photos[index];
    if (!photo) return;
    const token = displayRequest.current + 1;
    displayRequest.current = token;
    setOpenIndex(index);
    setDisplayUrl(null);
    setDisplayError(null);
    try {
      const variant = photo.mediaType === "video" ? "original" : "display";
      const result = await api<{ url: string }>(`/api/photos/${photo.id}/url?variant=${variant}`);
      if (displayRequest.current === token) setDisplayUrl(result.url);
    } catch (caught) {
      if (displayRequest.current === token) {
        setDisplayError(caught instanceof Error ? caught.message : "Das Bild konnte nicht geladen werden.");
      }
    }
  }

  async function chooseKind(next: MediaFilter) {
    setKind(next);
    setError(null);
    setOpenIndex(null);
    if (next === "all") {
      setReplaced(null);
      setCursor(initialCursor);
      return;
    }
    setLoading(true);
    try {
      const page = await api<{ photos: GalleryPhoto[]; nextCursor: string | null }>(`/api/photos?scope=${scope}&media=${next}`);
      setReplaced(page.photos);
      setCursor(page.nextCursor);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Der Filter konnte nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }

  async function remove(photo: GalleryPhoto) {
    if (!window.confirm("Dieses Foto unwiderruflich löschen?")) return;
    setError(null);
    try {
      await api(`/api/photos/${photo.id}`, { method: "DELETE" });
      setHidden((current) => [...current, photo.id]);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Löschen fehlgeschlagen.");
    }
  }

  return (
    <section>
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-muted">{intro}</p>
        </div>
      </div>
      <div className="mb-4 flex gap-2" role="group" aria-label="Filter">
        {(
          [
            ["all", "Alle"],
            ["photo", "Fotos"],
            ["video", "Videos"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={kind === value}
            onClick={() => void chooseKind(value)}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold ${kind === value ? "bg-accent text-accent-ink" : "bg-card text-muted ring-1 ring-line"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {scope === "mine" ? <Uploader onUploaded={() => router.refresh()} /> : null}
      {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}
      {photos.length === 0 ? (
        <p className="mt-10 rounded-3xl bg-card px-5 py-8 text-sm text-muted ring-1 ring-line">
          {scope === "mine" ? "Dein Ordner ist noch leer. Lade das erste Foto hoch." : "Noch keine Fotos in der Gruppe."}
        </p>
      ) : scope === "group" ? (
        <div className="mt-6 space-y-8">
          {groups.map((month) => (
            <section key={month.monthKey}>
              <h2 className="font-display text-2xl">{month.label}</h2>
              <div className="mt-3 space-y-5">
                {month.days.map((day) => (
                  <div key={day.dayKey}>
                    <h3 className="mb-2 text-sm font-medium text-muted">{day.label}</h3>
                    <TileGrid photos={day.photos} all={photos} onOpen={(index) => void show(index)} onError={refreshThumb} />
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="mt-6">
          <TileGrid photos={photos} all={photos} onOpen={(index) => void show(index)} onError={refreshThumb} onDelete={canDelete ? remove : undefined} />
        </div>
      )}
      <div ref={sentinel} className="h-8" />
      {cursor ? (
        <button type="button" onClick={() => void loadMore()} disabled={loading} className="text-sm font-semibold text-accent">
          {loading ? "Lädt…" : "Ältere Fotos laden"}
        </button>
      ) : null}
      {openIndex !== null ? (
        <Lightbox
          photos={photos}
          index={openIndex}
          src={displayUrl}
          error={displayError}
          onClose={() => setOpenIndex(null)}
          onIndex={(index) => void show(index)}
          onRenew={
            photos[openIndex]?.mediaType === "video"
              ? async () => {
                  const current = photos[openIndex];
                  if (!current) return null;
                  const result = await api<{ url: string }>(`/api/photos/${current.id}/url?variant=original`);
                  setDisplayUrl(result.url);
                  return result.url;
                }
              : undefined
          }
          onDownload={
            photos[openIndex]?.mediaType === "video"
              ? async () => {
                  const current = photos[openIndex];
                  if (!current) return null;
                  const result = await api<{ url: string }>(`/api/photos/${current.id}/url?variant=original&download=1`);
                  return result.url;
                }
              : undefined
          }
        />
      ) : null}
    </section>
  );
}

function TileGrid({
  photos,
  all,
  onOpen,
  onError,
  onDelete,
}: {
  photos: GalleryPhoto[];
  all: GalleryPhoto[];
  onOpen: (index: number) => void;
  onError: (photo: GalleryPhoto) => void;
  onDelete?: (photo: GalleryPhoto) => void;
}) {
  return (
    <ul className="grid grid-cols-3 gap-1 sm:grid-cols-4">
      {photos.map((photo) => (
        <li key={photo.id} className="relative">
          <button
            type="button"
            aria-label={photo.mediaType === "video" && !photo.thumbUrl ? `Video ${photo.filename}` : undefined}
            onClick={() => onOpen(all.findIndex((item) => item.id === photo.id))}
            className="block w-full"
          >
            {photo.mediaType === "video" && !photo.thumbUrl ? (
              <span className="flex aspect-square w-full items-center justify-center bg-stone-800 text-sm font-semibold text-white">Video</span>
            ) : (
              // Presigned thumbnails expire after a few minutes and stay outside the optimizer.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photo.thumbUrl}
                alt={photo.mediaType === "video" ? `Video ${photo.filename}` : `${photo.uploaderName}: ${photo.filename}`}
                loading="lazy"
                onError={() => onError(photo)}
                className="aspect-square w-full bg-line object-cover"
              />
            )}
            {photo.mediaType === "video" ? (
              <span className="absolute bottom-1 left-1 rounded bg-stone-950/75 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                {formatDuration(photo.durationMs) || "Video"}
              </span>
            ) : null}
          </button>
          {onDelete ? (
            <button
              type="button"
              onClick={() => onDelete(photo)}
              className="absolute top-1 right-1 rounded-full bg-stone-950/70 px-2 py-1 text-[11px] font-semibold text-white"
              aria-label={`${photo.filename} löschen`}
            >
              Löschen
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
