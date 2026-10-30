import { isReasonableCaptureDate, parseExifDateTime } from '@/lib/dates'

const APPLE_DATE =
  /com\.apple\.quicktime\.creationdate[\s\S]{0,96}?(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)/i

const QUICKTIME_EPOCH = Date.UTC(1904, 0, 1)
const CODECS: Record<string, string> = {
  avc1: 'h264',
  avc3: 'h264',
  hvc1: 'hevc',
  hev1: 'hevc',
  dvh1: 'hevc',
  vp09: 'vp9',
  av01: 'av1',
  mp4v: 'mp4v',
  s263: 'h263',
}

export type VideoMetadata = {
  appleDate: Date | null
  mvhdDate: Date | null
  durationMs: number | null
  width: number | null
  height: number | null
  codec: string | null
}

export function resolveVideoCapturedAt(input: {
  appleDate: Date | null
  mvhdDate: Date | null
  lastModified: number | null
  uploadDate: Date
}): Date {
  if (input.appleDate && isReasonableCaptureDate(input.appleDate)) return input.appleDate
  if (input.mvhdDate && isReasonableCaptureDate(input.mvhdDate)) return input.mvhdDate
  if (typeof input.lastModified === 'number') {
    const modified = new Date(input.lastModified)
    if (isReasonableCaptureDate(modified)) return modified
  }
  return input.uploadDate
}

export function parseVideoMetadata(bytes: Uint8Array): VideoMetadata {
  const moov = findBox(bytes, 'moov')
  const scope = moov ? bytes.subarray(moov.payloadStart, moov.end) : bytes
  const mvhd = findBox(scope, 'mvhd')
  const tkhd = findBox(scope, 'tkhd')
  const timing = mvhd ? readMvhd(scope.subarray(mvhd.payloadStart, mvhd.end)) : { date: null, durationMs: null }
  const dimensions = tkhd ? readTkhd(scope.subarray(tkhd.payloadStart, tkhd.end)) : { width: null, height: null }
  return {
    appleDate: readAppleDate(scope),
    mvhdDate: timing.date,
    durationMs: timing.durationMs,
    width: dimensions.width,
    height: dimensions.height,
    codec: readCodec(scope),
  }
}

export function mergeVideoMetadata(parts: VideoMetadata[]): VideoMetadata {
  return parts.reduce<VideoMetadata>(
    (merged, part) => ({
      appleDate: merged.appleDate ?? part.appleDate,
      mvhdDate: merged.mvhdDate ?? part.mvhdDate,
      durationMs: merged.durationMs ?? part.durationMs,
      width: merged.width ?? part.width,
      height: merged.height ?? part.height,
      codec: merged.codec ?? part.codec,
    }),
    { appleDate: null, mvhdDate: null, durationMs: null, width: null, height: null, codec: null },
  )
}

function readAppleDate(bytes: Uint8Array): Date | null {
  const text = latin1(bytes)
  const match = APPLE_DATE.exec(text)
  if (!match?.[1]) return null
  const raw = match[1]
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(raw)) {
    const parsed = new Date(raw)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  const naive = raw.replace('T', ' ').slice(0, 19).replace(/-/g, ':')
  return parseExifDateTime(naive)
}

function readMvhd(payload: Uint8Array): { date: Date | null; durationMs: number | null } {
  if (payload.length < 20) return { date: null, durationMs: null }
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength)
  const version = payload[0] ?? 0
  const creation = version === 1 && payload.length >= 32 ? readU64(view, 4) : view.getUint32(4)
  const timescale = version === 1 && payload.length >= 32 ? view.getUint32(20) : view.getUint32(12)
  const duration = version === 1 && payload.length >= 32 ? readU64(view, 24) : view.getUint32(16)
  const date = creation > 0 ? new Date(QUICKTIME_EPOCH + creation * 1000) : null
  const durationMs = timescale > 0 ? Math.round((duration / timescale) * 1000) : null
  return {
    date: date && isReasonableCaptureDate(date) ? date : null,
    durationMs: durationMs != null && durationMs >= 0 ? durationMs : null,
  }
}

function readTkhd(payload: Uint8Array): { width: number | null; height: number | null } {
  const version = payload[0] ?? 0
  const offset = version === 1 ? 88 : 76
  if (payload.length < offset + 8) return { width: null, height: null }
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength)
  const width = Math.round(view.getUint32(offset) / 65536)
  const height = Math.round(view.getUint32(offset + 4) / 65536)
  return {
    width: width > 0 && width <= 20000 ? width : null,
    height: height > 0 && height <= 20000 ? height : null,
  }
}

function readCodec(bytes: Uint8Array): string | null {
  const text = latin1(bytes)
  for (const token of Object.keys(CODECS)) {
    if (text.includes(token)) return CODECS[token] ?? null
  }
  return null
}

function findBox(bytes: Uint8Array, type: string): { payloadStart: number; end: number } | null {
  const a = type.charCodeAt(0)
  const b = type.charCodeAt(1)
  const c = type.charCodeAt(2)
  const d = type.charCodeAt(3)
  for (let index = 4; index + 4 < bytes.length; index += 1) {
    if (bytes[index] !== a || bytes[index + 1] !== b || bytes[index + 2] !== c || bytes[index + 3] !== d) continue
    const start = index - 4
    const size = new DataView(bytes.buffer, bytes.byteOffset + start, 4).getUint32(0)
    if (size < 8 || start + size > bytes.length) continue
    return { payloadStart: start + 8, end: start + size }
  }
  return null
}

function readU64(view: DataView, offset: number): number {
  const high = view.getUint32(offset)
  const low = view.getUint32(offset + 4)
  return high * 2 ** 32 + low
}

function latin1(bytes: Uint8Array): string {
  let text = ''
  const step = 0x8000
  for (let index = 0; index < bytes.length; index += step) {
    text += String.fromCharCode(...bytes.subarray(index, index + step))
  }
  return text
}
