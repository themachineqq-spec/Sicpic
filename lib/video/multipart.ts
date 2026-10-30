import { AppError } from '@/lib/errors'

export const VIDEO_MAX_BYTES = 4 * 1024 * 1024 * 1024
export const VIDEO_PART_BYTES = 16 * 1024 * 1024
const MAX_PARTS = 10000

export type VideoPartPlan = {
  partSize: number
  partCount: number
}

export function planVideoParts(byteSize: number, partSize = VIDEO_PART_BYTES): VideoPartPlan {
  if (!Number.isSafeInteger(byteSize) || byteSize < 1 || byteSize > VIDEO_MAX_BYTES) {
    throw new AppError(400, 'bad_request', 'Videos dürfen höchstens 4 GB groß sein.')
  }
  if (!Number.isSafeInteger(partSize) || partSize < 5 * 1024 * 1024) {
    throw new AppError(500, 'config', 'Die Teilgröße für den Upload ist ungültig.')
  }
  const partCount = Math.ceil(byteSize / partSize)
  if (partCount > MAX_PARTS) {
    throw new AppError(400, 'bad_request', 'Das Video braucht zu viele Upload-Teile.')
  }
  return { partSize, partCount }
}

export function assertUploadId(value: string): string {
  if (!value || value.length < 8 || value.length > 1024 || /[\s/\\]/.test(value) || value.includes('..')) {
    throw new AppError(400, 'bad_request', 'Ungültige Upload-ID.')
  }
  return value
}

export function normalizeEtag(value: string): string {
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > 128 || /[\r\n]/.test(trimmed)) {
    throw new AppError(400, 'bad_request', 'Eine Upload-Prüfsumme fehlt.')
  }
  return trimmed.includes('"') ? trimmed : `"${trimmed}"`
}

export function assertCompleteParts(
  parts: { partNumber: number; etag: string }[],
  partCount: number,
): { partNumber: number; etag: string }[] {
  const sorted = [...parts].sort((a, b) => a.partNumber - b.partNumber)
  if (sorted.length !== partCount) {
    throw new AppError(400, 'bad_request', 'Es fehlen Upload-Teile.')
  }
  return sorted.map((part, index) => {
    if (part.partNumber !== index + 1) {
      throw new AppError(400, 'bad_request', 'Die Upload-Teile sind unvollständig.')
    }
    return { partNumber: part.partNumber, etag: normalizeEtag(part.etag) }
  })
}

export type PartUploader = {
  byteSize: number
  partSize: number
  concurrency?: number
  getUrl: (partNumber: number) => Promise<string>
  slice: (start: number, end: number) => Blob
  put: (url: string, body: Blob, onProgress: (loaded: number) => void) => Promise<string>
  onProgress?: (ratio: number) => void
}

export async function uploadVideoParts(input: PartUploader): Promise<{ partNumber: number; etag: string }[]> {
  const plan = planVideoParts(input.byteSize, input.partSize)
  const results: { partNumber: number; etag: string }[] = []
  const loaded = new Map<number, number>()
  let cursor = 1

  function report() {
    let sum = 0
    for (const value of loaded.values()) sum += value
    input.onProgress?.(Math.min(1, sum / input.byteSize))
  }

  async function worker() {
    while (cursor <= plan.partCount) {
      const partNumber = cursor
      cursor += 1
      const start = (partNumber - 1) * plan.partSize
      const end = Math.min(start + plan.partSize, input.byteSize)
      let lastError: unknown
      for (let attempt = 0; attempt < 3; attempt += 1) {
        loaded.set(partNumber, 0)
        report()
        try {
          const url = await input.getUrl(partNumber)
          const etag = await input.put(url, input.slice(start, end), (amount) => {
            loaded.set(partNumber, amount)
            report()
          })
          loaded.set(partNumber, end - start)
          report()
          results.push({ partNumber, etag: normalizeEtag(etag) })
          lastError = undefined
          break
        } catch (error) {
          lastError = error
        }
      }
      if (lastError) throw lastError
    }
  }

  const workers = Math.max(1, Math.min(input.concurrency ?? 3, plan.partCount))
  await Promise.all(Array.from({ length: workers }, () => worker()))
  return results.sort((a, b) => a.partNumber - b.partNumber)
}
