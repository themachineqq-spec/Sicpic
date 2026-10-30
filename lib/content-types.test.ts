import { describe, expect, it } from 'vitest'
import { AppError } from '@/lib/errors'
import { fileExtension, isHeicExtension, isVideoFile, resolveOriginalType, resolveScreenshotType, resolveVideoType } from '@/lib/content-types'

describe('file types', () => {
  it('detects HEIC from the type or a missing browser type plus extension', () => {
    expect(resolveOriginalType('image/heic', 'bild.png')).toEqual({ contentType: 'image/heic', extension: 'heic' })
    expect(resolveOriginalType('image/heif-sequence', 'a.bin')).toEqual({ contentType: 'image/heif', extension: 'heif' })
    expect(resolveOriginalType('', 'Urlaub.HEIC')).toEqual({ contentType: 'image/heic', extension: 'heic' })
    expect(resolveOriginalType('application/octet-stream', 'a.jpeg')).toEqual({ contentType: 'image/jpeg', extension: 'jpg' })
    expect(isHeicExtension('heic')).toBe(true)
    expect(isHeicExtension('jpg')).toBe(false)
    expect(fileExtension('ordner/foto.PNG')).toBe('png')
  })

  it('rejects other types and screenshots that are not images we store', () => {
    expect(() => resolveOriginalType('image/gif', 'a.gif')).toThrow(AppError)
    expect(() => resolveOriginalType('image/jpeg', '')).not.toThrow()
    expect(resolveScreenshotType('image/webp')).toEqual({ contentType: 'image/webp', extension: 'webp' })
    expect(resolveScreenshotType('image/jpg')).toEqual({ contentType: 'image/jpeg', extension: 'jpg' })
    expect(resolveScreenshotType('image/png; charset=binary')).toEqual({ contentType: 'image/png', extension: 'png' })
    expect(resolveOriginalType('image/heic-sequence', 'a.bin').extension).toBe('heic')
    expect(resolveOriginalType('image/png', 'a.png').extension).toBe('png')
    expect(fileExtension('ohne')).toBe('')
    expect(isHeicExtension('heif')).toBe(true)
    expect(() => resolveScreenshotType('image/heic')).toThrow(/Screenshots/)
    expect(resolveVideoType('video/quicktime', 'a.mp4')).toEqual({ contentType: 'video/quicktime', extension: 'mov' })
    expect(resolveVideoType('', 'clip.webm')).toEqual({ contentType: 'video/webm', extension: 'webm' })
    expect(resolveVideoType('video/3gpp', 'a.3gp').extension).toBe('3gp')
    expect(isVideoFile({ name: 'a.mov', type: '' })).toBe(true)
    expect(isVideoFile({ name: 'a.jpg', type: 'image/jpeg' })).toBe(false)
    expect(() => resolveVideoType('video/ogg', 'a.ogg')).toThrow(/MP4/)
  })
})
