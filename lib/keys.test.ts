import { describe, expect, it } from 'vitest'
import { AppError } from '@/lib/errors'
import { LIMITS, assertSafeObjectKey, assertUuid, feedbackScreenshotKey, keyForVariant, photoObjectKeys, sanitizeFilename } from '@/lib/keys'

const memberId = '11111111-1111-4111-8111-111111111111'
const photoId = '44444444-4444-4444-8444-444444444444'

describe('object keys and size limits', () => {
  it('names originals inside the member folder and forces jpeg derivatives', () => {
    const keys = photoObjectKeys(memberId.toUpperCase(), photoId, 'heic')
    expect(keys.original).toBe(`members/${memberId}/photos/${photoId}/original.heic`)
    expect(keys.display).toBe(`members/${memberId}/photos/${photoId}/display.jpg`)
    expect(keys.thumb).toBe(`members/${memberId}/photos/${photoId}/thumb.jpg`)
    const stored = { originalKey: keys.original, displayKey: keys.display, thumbKey: keys.thumb }
    expect(keyForVariant(stored, 'original')).toBe(keys.original)
    expect(keyForVariant(stored, 'display')).toBe(keys.display)
    expect(keyForVariant(stored, 'thumb')).toBe(keys.thumb)
    expect(feedbackScreenshotKey(memberId, photoId, 'png')).toContain(`/screenshot.png`)
    expect(LIMITS.originalBytes).toBe(50 * 1024 * 1024)
    expect(LIMITS.thumbBytes).toBeLessThan(LIMITS.displayBytes)
  })

  it('rejects traversal, empty names and non-uuids', () => {
    expect(() => photoObjectKeys('../secret', photoId, 'jpg')).toThrow(AppError)
    expect(() => assertUuid('not-a-uuid', 'Foto')).toThrow(/ungültig/)
    expect(() => assertSafeObjectKey('a/../../b')).toThrow(AppError)
    expect(() => assertSafeObjectKey('//hidden')).toThrow(AppError)
    expect(sanitizeFilename('C:\\bilder\\ferien.jpg')).toBe('ferien.jpg')
    expect(sanitizeFilename('   ')).toBe('foto')
  })
})
