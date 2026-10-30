import { AppError } from '@/lib/errors'
import type { VideoExtension } from '@/lib/content-types'

export type VideoContainer = 'mp4' | 'mov' | '3gp' | 'webm'

const FTYP = [0x66, 0x74, 0x79, 0x70]
const EBML = [0x1a, 0x45, 0xdf, 0xa3]

function brand(bytes: Uint8Array): string {
  return String.fromCharCode(bytes[8] ?? 0, bytes[9] ?? 0, bytes[10] ?? 0, bytes[11] ?? 0).trim().toLowerCase()
}

export function sniffContainer(bytes: Uint8Array): VideoContainer | null {
  if (bytes.length >= 4 && EBML.every((value, index) => bytes[index] === value)) return 'webm'
  if (bytes.length < 12 || !FTYP.every((value, index) => bytes[index + 4] === value)) return null
  const major = brand(bytes)
  if (major.startsWith('3g')) return '3gp'
  if (major === 'qt' || major === 'mov') return 'mov'
  return 'mp4'
}

export function assertVideoHeader(bytes: Uint8Array, extension: VideoExtension): VideoContainer {
  const sniffed = sniffContainer(bytes)
  if (!sniffed) {
    throw new AppError(400, 'unsupported_type', 'Die Datei ist kein erkanntes Video.')
  }
  const iso = sniffed === 'mp4' || sniffed === 'mov'
  const declaredIso = extension === 'mp4' || extension === 'mov'
  if (iso && declaredIso) return sniffed
  if (sniffed !== extension) {
    throw new AppError(400, 'unsupported_type', 'Dateityp und Inhalt passen nicht zusammen.')
  }
  return sniffed
}

export function decodeVideoHeader(value: string): Uint8Array {
  const normalized = value.trim()
  if (!normalized || normalized.length > 120) {
    throw new AppError(400, 'bad_request', 'Der Dateikopf fehlt.')
  }
  const bytes = new Uint8Array(Buffer.from(normalized, 'base64'))
  if (bytes.length < 12 || bytes.length > 64) {
    throw new AppError(400, 'bad_request', 'Der Dateikopf fehlt.')
  }
  return bytes
}
