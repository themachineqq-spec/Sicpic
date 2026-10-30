"use client";

import { useRef, useState } from "react";
import { api } from "@/lib/api-client";
import { putWithProgress } from "@/lib/browser-upload";
import { THUMB_CACHE_CONTROL } from "@/lib/images/thumbs";
import { isVideoFile } from "@/lib/content-types";
import { preparePhotoFile } from "@/lib/images/prepare-photo";
import { uploadPreparedVideo } from "@/lib/video/client-upload";

type Item = {
  name: string;
  progress: number;
  status: "queued" | "running" | "done" | "error";
  message?: string;
};

type UploadGrant = {
  photoId: string;
  original: { url: string; contentType: string };
  display: { url: string; contentType: string };
  thumb: { url: string; contentType: string };
  thumbLarge?: { url: string; contentType: string };
};

export function Uploader({ onUploaded }: { onUploaded: () => void }) {
  const input = useRef<HTMLInputElement | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);

  function patch(index: number, next: Partial<Item>) {
    setItems((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...next } : item)));
  }

  async function uploadOne(file: File, index: number) {
    patch(index, { status: "running", progress: 0.02, message: "Wird vorbereitet…" });
    if (isVideoFile(file)) {
      await uploadPreparedVideo(file, {
        onProgress: (ratio, message) => patch(index, { progress: ratio, message, status: ratio >= 1 ? "done" : "running" }),
      });
      return;
    }
    const prepared = await preparePhotoFile(file);
    patch(index, { progress: 0.08, message: "Wird hochgeladen…" });
    const grant = await api<UploadGrant>("/api/photos/uploads", {
      method: "POST",
      body: JSON.stringify({
        filename: prepared.filename,
        contentType: prepared.originalContentType,
        thumbContentType: prepared.thumbContentType,
      }),
    });
    const thumbHeaders = { "Cache-Control": THUMB_CACHE_CONTROL };
    await putWithProgress(grant.original.url, prepared.original, grant.original.contentType, (ratio) => {
      patch(index, { progress: 0.08 + ratio * 0.5 });
    });
    await putWithProgress(grant.display.url, prepared.display, grant.display.contentType, (ratio) => {
      patch(index, { progress: 0.58 + ratio * 0.16 });
    });
    await putWithProgress(grant.thumb.url, prepared.thumb, grant.thumb.contentType, (ratio) => {
      patch(index, { progress: 0.74 + ratio * 0.1 });
    }, thumbHeaders);
    if (grant.thumbLarge && prepared.thumbLarge) {
      await putWithProgress(grant.thumbLarge.url, prepared.thumbLarge, grant.thumbLarge.contentType, (ratio) => {
        patch(index, { progress: 0.84 + ratio * 0.1 });
      }, thumbHeaders);
    }
    await api("/api/photos", {
      method: "POST",
      body: JSON.stringify({
        photoId: grant.photoId,
        filename: prepared.filename,
        contentType: prepared.originalContentType,
        width: prepared.width,
        height: prepared.height,
        capturedAt: prepared.capturedAt.toISOString(),
        blurData: prepared.blurData,
        thumbContentType: prepared.thumbContentType,
      }),
    });
    patch(index, { status: "done", progress: 1, message: "Gespeichert" });
  }

  async function onFiles(files: File[]) {
    if (files.length === 0 || busy) return;
    setBusy(true);
    const start = items.length;
    setItems((current) => [...current, ...files.map((file) => ({ name: file.name, progress: 0, status: "queued" as const }))]);
    let completed = 0;
    const queue = files.map((file, offset) => ({ file, index: start + offset }));
    async function worker() {
      while (queue.length > 0) {
        const job = queue.shift();
        if (!job) return;
        try {
          await uploadOne(job.file, job.index);
          completed += 1;
        } catch (caught) {
          patch(job.index, {
            status: "error",
            message: caught instanceof Error ? caught.message : "Upload fehlgeschlagen.",
          });
        }
      }
    }
    await Promise.all([worker(), worker()]);
    if (completed > 0) onUploaded();
    setBusy(false);
    if (input.current) input.current.value = "";
  }

  return (
    <div className="rounded-3xl bg-card p-4 ring-1 ring-line">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-semibold">Fotos hinzufügen</p>
          <p className="text-sm text-muted">JPEG, PNG, HEIC oder Video (MOV, MP4, 3GP, WebM).</p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-ink disabled:opacity-50"
        >
          Auswählen
        </button>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/heic,image/heif,.heic,.heif,.jpg,.jpeg,.png,video/mp4,video/quicktime,video/webm,video/3gpp,.mp4,.mov,.m4v,.webm,.3gp"
        multiple
        className="sr-only"
        onChange={(event) => void onFiles([...(event.target.files ?? [])])}
      />
      {items.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {items.map((item, index) => (
            <li key={`${item.name}-${index}`}>
              <div className="flex justify-between gap-3 text-sm">
                <span className="truncate">{item.name}</span>
                <span className={item.status === "error" ? "text-danger" : "text-muted"}>{item.message ?? "Wartet"}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line">
                <div className="h-full bg-accent" style={{ width: `${Math.round(item.progress * 100)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
