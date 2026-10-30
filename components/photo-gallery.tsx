"use client";

import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api-client";
import { sortPhotosNewestFirst } from "@/lib/dates";
import {
  filterRangeInstants,
  filtersActive,
  filtersToQuery,
  galleryCacheKey,
  indexPhotos,
  parseGalleryFilters,
  selectPhotos,
  type GalleryFilters,
} from "@/lib/gallery-filters";
import { invalidateSessionCache, writeSessionCache } from "@/lib/session-cache";
import type { GalleryPhoto, MediaFilter, PhotoScope } from "@/lib/types";
import { Lightbox } from "@/components/lightbox";
import { Uploader } from "@/components/uploader";
import { VirtualGallery } from "@/components/virtual-gallery";
import { upgradeLegacyThumb } from "@/lib/images/upgrade-thumb";
import { monthJumpCursor } from "@/lib/images/thumbs";

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
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [extra, setExtra] = useState<GalleryPhoto[]>([]);
  const [cursor, setCursor] = useState(initialCursor);
  const [hidden, setHidden] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [months, setMonths] = useState<{ monthKey: string; photoCount: number }[]>([]);
  const [people, setPeople] = useState<{ id: string; name: string }[]>([]);
  const [filters, setFilters] = useState<GalleryFilters>(() => parseGalleryFilters(searchParams ?? new URLSearchParams()));
  const deferredFilters = useDeferredValue(filters);
  const [replaced, setReplaced] = useState<GalleryPhoto[] | null>(null);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [displayUrl, setDisplayUrl] = useState<string | null>(null);
  const [displayError, setDisplayError] = useState<string | null>(null);
  const sentinel = useRef<HTMLDivElement | null>(null);
  const displayRequest = useRef(0);

  const loaded = useMemo(() => {
    const merged = new Map<string, GalleryPhoto>();
    for (const photo of initial) merged.set(photo.id, photo);
    for (const photo of extra) merged.set(photo.id, photo);
    const base = replaced ?? [...merged.values()];
    return sortPhotosNewestFirst(base.filter((photo) => !hidden.includes(photo.id)));
  }, [initial, extra, replaced, hidden]);
  const index = useMemo(() => indexPhotos(loaded), [loaded]);
  const photos = useMemo(() => selectPhotos(index, deferredFilters), [index, deferredFilters]);
  const ownerOptions = people.length > 0 ? people : index.owners;

  function listQuery(nextFilters: GalleryFilters, nextCursor: string | null) {
    const range = filterRangeInstants(nextFilters);
    const params = new URLSearchParams({ scope, media: nextFilters.media });
    if (nextCursor) params.set("cursor", nextCursor);
    if (nextFilters.ownerId) params.set("owner", nextFilters.ownerId);
    if (range.from) params.set("from", range.from);
    if (range.to) params.set("to", range.to);
    return `/api/photos?${params.toString()}`;
  }

  function updateFilters(next: GalleryFilters) {
    setFilters(next);
    setOpenIndex(null);
    const query = filtersToQuery(next);
    startTransition(() => {
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
  }

  async function loadMore() {
    if (!cursor || loading) return;
    setLoading(true);
    setError(null);
    try {
      const page = await api<{ photos: GalleryPhoto[]; nextCursor: string | null }>(listQuery(filters, cursor));
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
    let cancelled = false;
    const range = filterRangeInstants(filters);
    const params = new URLSearchParams({ scope, media: filters.media });
    if (filters.ownerId) params.set("owner", filters.ownerId);
    if (range.from) params.set("from", range.from);
    if (range.to) params.set("to", range.to);
    void api<{ months?: { monthKey: string; photoCount: number }[] }>(`/api/photos/months?${params.toString()}`)
      .then((result) => {
        if (!cancelled) setMonths(result.months ?? []);
      })
      .catch(() => {
        if (!cancelled) setMonths([]);
      });
    return () => {
      cancelled = true;
    };
  }, [scope, filters]);

  useEffect(() => {
    if (scope !== "group") return;
    let cancelled = false;
    void api<{ people?: { id: string; name: string }[] }>(`/api/photos/people?scope=${scope}`)
      .then((result) => {
        if (!cancelled && Array.isArray(result.people)) setPeople(result.people);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [scope]);

  useEffect(() => {
    if (!filtersActive(filters)) return;
    let cancelled = false;
    void api<{ photos?: GalleryPhoto[]; nextCursor: string | null }>(listQuery(filters, null))
      .then((page) => {
        if (cancelled || !Array.isArray(page.photos)) return;
        startTransition(() => {
          setReplaced(page.photos ?? []);
          setCursor(page.nextCursor);
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // Refetch the filtered page in the background. The grid already shows the local match.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, filters]);

  useEffect(() => {
    if (!loaded.length) return;
    writeSessionCache(galleryCacheKey(scope, filters), { photos: loaded, nextCursor: cursor });
  }, [scope, filters, loaded, cursor]);

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

  async function jumpTo(monthKey: string) {
    setError(null);
    setLoading(true);
    try {
      const page = await api<{ photos: GalleryPhoto[]; nextCursor: string | null }>(
        listQuery(filters, monthJumpCursor(monthKey)),
      );
      setReplaced(page.photos);
      setCursor(page.nextCursor);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Der Monat konnte nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }

  function chooseKind(next: MediaFilter) {
    setError(null);
    if (next === "all" && !filters.ownerId && !filters.from && !filters.to) {
      setReplaced(null);
      setCursor(initialCursor);
    }
    updateFilters({ ...filters, media: next });
  }

  async function remove(photo: GalleryPhoto) {
    if (!window.confirm("Dieses Foto unwiderruflich löschen?")) return;
    setError(null);
    try {
      await api(`/api/photos/${photo.id}`, { method: "DELETE" });
      invalidateSessionCache("gallery:");
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
      <div className="mb-4 flex flex-wrap items-end gap-2" role="group" aria-label="Filter">
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
            aria-pressed={filters.media === value}
            onClick={() => chooseKind(value)}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold ${filters.media === value ? "bg-accent text-accent-ink" : "bg-card text-muted ring-1 ring-line"}`}
          >
            {label}
          </button>
        ))}
        {scope === "group" ? (
          <label className="text-sm font-medium text-muted">
            Person
            <select
              aria-label="Person"
              value={filters.ownerId ?? ""}
              onChange={(event) => updateFilters({ ...filters, ownerId: event.target.value || null })}
              className="ml-2 rounded-full bg-card px-3 py-1.5 text-sm text-foreground ring-1 ring-line"
            >
              <option value="">Alle Personen</option>
              {ownerOptions.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="text-sm font-medium text-muted">
          Von
          <input
            aria-label="Von"
            type="date"
            value={filters.from ?? ""}
            onChange={(event) => updateFilters({ ...filters, from: event.target.value || null })}
            className="ml-2 rounded-full bg-card px-3 py-1.5 text-sm ring-1 ring-line"
          />
        </label>
        <label className="text-sm font-medium text-muted">
          Bis
          <input
            aria-label="Bis"
            type="date"
            value={filters.to ?? ""}
            onChange={(event) => updateFilters({ ...filters, to: event.target.value || null })}
            className="ml-2 rounded-full bg-card px-3 py-1.5 text-sm ring-1 ring-line"
          />
        </label>
      </div>
      {scope === "mine" ? (
        <Uploader
          onUploaded={() => {
            invalidateSessionCache("gallery:");
            router.refresh();
          }}
        />
      ) : null}
      {scope === "mine" && photos.some((photo) => photo.thumbUrl && !photo.blurData) ? (
        <button
          type="button"
          className="mt-3 text-sm font-semibold text-accent"
          onClick={() => {
            const legacy = photos.filter((photo) => photo.thumbUrl && !photo.blurData).slice(0, 8);
            void Promise.all(legacy.map((photo) => upgradeLegacyThumb(photo).catch(() => undefined))).then(() => router.refresh());
          }}
        >
          Alte Vorschaubilder erneuern
        </button>
      ) : null}
      {months.length > 0 ? (
        <div className="mb-4 flex gap-2 overflow-x-auto pb-1" aria-label="Monate">
          {months.map((month) => (
            <button
              key={month.monthKey}
              type="button"
              onClick={() => void jumpTo(month.monthKey)}
              className="shrink-0 rounded-full bg-card px-3 py-1 text-xs font-semibold text-muted ring-1 ring-line"
            >
              {month.monthKey}
              <span className="ml-1 text-stone-400">{month.photoCount}</span>
            </button>
          ))}
        </div>
      ) : null}
      {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}
      {photos.length === 0 ? (
        <p className="mt-10 rounded-3xl bg-card px-5 py-8 text-sm text-muted ring-1 ring-line">
          {loaded.length > 0
            ? "Nichts passt zu diesem Filter."
            : scope === "mine"
              ? "Dein Ordner ist noch leer. Lade das erste Foto hoch."
              : "Noch keine Fotos in der Gruppe."}
        </p>
      ) : (
        <VirtualGallery
          photos={photos}
          scope={scope}
          onOpen={(index) => void show(index)}
          onError={refreshThumb}
          onDelete={canDelete ? remove : undefined}
          onNearEnd={() => void loadMore()}
        />
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

