"use client";

import { useEffect, useRef, useState } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { buildGalleryRows, estimateRowHeight } from "@/lib/images/gallery-rows";
import { columnsForWidth } from "@/lib/images/thumbs";
import type { GalleryPhoto, PhotoScope } from "@/lib/types";
import { formatDuration } from "@/lib/video/time";

export function VirtualGallery({
  photos,
  scope,
  onOpen,
  onError,
  onDelete,
  onNearEnd,
}: {
  photos: GalleryPhoto[];
  scope: PhotoScope;
  onOpen: (index: number) => void;
  onError: (photo: GalleryPhoto) => void;
  onDelete?: (photo: GalleryPhoto) => void;
  onNearEnd: () => void;
}) {
  const [width, setWidth] = useState(390);
  const [scrollMargin, setScrollMargin] = useState(0);
  const anchor = useRef<HTMLDivElement | null>(null);
  const columns = columnsForWidth(width);
  const rows = buildGalleryRows(photos, scope, columns);
  const tile = Math.max(96, Math.floor((width - (columns - 1) * 4) / columns));
  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: (index) => estimateRowHeight(rows[index] ?? { kind: "tiles", key: "", photos: [] }, tile),
    overscan: 4,
    initialRect: { width: 390, height: 800 },
    scrollMargin,
  });
  const virtualItems = virtualizer.getVirtualItems();
  const visible = virtualItems.length > 0 ? virtualItems : rows.map((_, index) => ({ index, start: index * tile, size: tile, key: index }));

  useEffect(() => {
    const node = anchor.current;
    if (!node) return;
    const update = () => {
      setWidth(node.clientWidth || 390);
      setScrollMargin(node.offsetTop || 0);
    };
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const last = virtualItems.at(-1);
    if (last && last.index >= rows.length - 3) onNearEnd();
  }, [virtualItems, rows.length, onNearEnd]);

  return (
    <div ref={anchor} className="relative mt-6" style={{ height: virtualizer.getTotalSize() || undefined }}>
      {visible.map((item) => {
        const row = rows[item.index];
        if (!row) return null;
        return (
          <div
            key={row.key}
            className="absolute top-0 left-0 w-full"
            style={{ transform: `translateY(${item.start - scrollMargin}px)` }}
          >
            {row.kind === "month" ? <h2 className="font-display text-2xl">{row.label}</h2> : null}
            {row.kind === "day" ? <h3 className="text-sm font-medium text-muted">{row.label}</h3> : null}
            {row.kind === "tiles" ? (
              <ul className="grid gap-1" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
                {row.photos.map((photo) => (
                  <Tile key={photo.id} photo={photo} all={photos} onOpen={onOpen} onError={onError} onDelete={onDelete} />
                ))}
              </ul>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function Tile({
  photo,
  all,
  onOpen,
  onError,
  onDelete,
}: {
  photo: GalleryPhoto;
  all: GalleryPhoto[];
  onOpen: (index: number) => void;
  onError: (photo: GalleryPhoto) => void;
  onDelete?: (photo: GalleryPhoto) => void;
}) {
  const image = useRef<HTMLImageElement | null>(null);
  useEffect(() => {
    const node = image.current;
    return () => {
      if (node) node.src = "";
    };
  }, [photo.thumbUrl]);

  return (
    <li className="relative">
      <button
        type="button"
        aria-label={photo.mediaType === "video" && !photo.thumbUrl ? `Video ${photo.filename}` : undefined}
        onClick={() => onOpen(all.findIndex((item) => item.id === photo.id))}
        className="block w-full"
      >
        <span className="relative block aspect-square overflow-hidden bg-line">
          {photo.mediaType === "video" && !photo.thumbUrl ? (
            <span className="flex h-full items-center justify-center bg-stone-800 text-sm font-semibold text-white">Video</span>
          ) : (
            // Presigned thumbs stay outside the optimizer. src is cleared when the tile leaves the window.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              ref={image}
              src={photo.thumbUrl}
              srcSet={photo.thumbUrlLarge ? `${photo.thumbUrl} 320w, ${photo.thumbUrlLarge} 640w` : undefined}
              sizes="(min-width: 640px) 25vw, 33vw"
              alt={photo.mediaType === "video" ? `Video ${photo.filename}` : `${photo.uploaderName}: ${photo.filename}`}
              width={320}
              height={320}
              decoding="async"
              loading="lazy"
              onError={() => onError(photo)}
              className="aspect-square h-full w-full object-cover"
              style={photo.blurData ? { backgroundImage: `url("${photo.blurData}")`, backgroundSize: "cover" } : undefined}
            />
          )}
          {photo.mediaType === "video" ? (
            <span className="absolute bottom-1 left-1 rounded bg-stone-950/75 px-1.5 py-0.5 text-[11px] font-semibold text-white">
              {formatDuration(photo.durationMs) || "Video"}
            </span>
          ) : null}
        </span>
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
  );
}
