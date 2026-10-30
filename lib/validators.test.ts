import { describe, expect, it } from 'vitest'
import { AppError } from '@/lib/errors'
import {
  completePhotoSchema,
  feedbackSchema,
  feedbackStatusSchema,
  memberCreateSchema,
  parseInput,
  thumbRefreshSchema,
  uploadRequestSchema,
} from '@/lib/validators'

const id = '44444444-4444-4444-8444-444444444444'

describe('input schemas', () => {
  it('accepts a photo upload and rejects a short feedback title', () => {
    expect(parseInput(uploadRequestSchema, { filename: ' a.jpg ', contentType: 'image/jpeg' }).filename).toBe('a.jpg')
    expect(() => parseInput(feedbackSchema, { id, kind: 'bug', title: 'x', body: 'zu kurz' })).toThrow(/Titel/)
    expect(parseInput(feedbackStatusSchema, { status: 'in_arbeit' }).status).toBe('in_arbeit')
    expect(parseInput(memberCreateSchema, { email: ' A@Example.com ' }).email).toBe('A@Example.com')
  })

  it('rejects corrupt ids and too many thumbnail refreshes', () => {
    expect(() =>
      parseInput(completePhotoSchema, {
        photoId: 'nope',
        filename: 'a.jpg',
        contentType: 'image/jpeg',
        width: 1,
        height: 1,
        capturedAt: '2024-01-01',
      }),
    ).toThrow(AppError)
    expect(() => parseInput(thumbRefreshSchema, { ids: Array.from({ length: 49 }, () => id) })).toThrow(AppError)
    expect(() => parseInput(uploadRequestSchema, null)).toThrow(/ungültig|Expected/)
  })
})
