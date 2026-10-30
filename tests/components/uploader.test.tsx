// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

const preparePhotoFile = vi.hoisted(() => vi.fn())
const putWithProgress = vi.hoisted(() => vi.fn(async () => undefined))
const api = vi.hoisted(() => vi.fn())

vi.mock('@/lib/images/prepare-photo', () => ({ preparePhotoFile }))
vi.mock('@/lib/browser-upload', () => ({ putWithProgress }))
vi.mock('@/lib/api-client', () => ({ api }))

const prepared = {
  filename: 'strand.jpg',
  original: new Blob(['original']),
  originalContentType: 'image/jpeg',
  display: new Blob(['display']),
  thumb: new Blob(['thumb']),
  width: 1600,
  height: 900,
  capturedAt: new Date('2024-07-01T13:30:45.000Z'),
}

describe('Uploader', () => {
  afterEach(() => {
    cleanup()
    preparePhotoFile.mockReset()
    putWithProgress.mockClear()
    api.mockReset()
  })

  it('prepares a file, uploads the three parts and tells the gallery to refresh', async () => {
    preparePhotoFile.mockResolvedValue(prepared)
    api.mockImplementation(async (path: string) => {
      if (path === '/api/photos/uploads') {
        return {
          photoId: '44444444-4444-4444-8444-444444444444',
          original: { url: '/put/original', contentType: 'image/jpeg' },
          display: { url: '/put/display', contentType: 'image/jpeg' },
          thumb: { url: '/put/thumb', contentType: 'image/jpeg' },
        }
      }
      return { id: '44444444-4444-4444-8444-444444444444' }
    })
    const onUploaded = vi.fn()
    const { Uploader } = await import('@/components/uploader')
    const { container } = render(<Uploader onUploaded={onUploaded} />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(input, new File(['jpeg'], 'strand.jpg', { type: 'image/jpeg' }))
    expect(await screen.findByText('Gespeichert')).toBeTruthy()
    expect(putWithProgress).toHaveBeenCalledTimes(3)
    expect(api).toHaveBeenCalledWith('/api/photos', expect.objectContaining({ method: 'POST' }))
    expect(onUploaded).toHaveBeenCalledTimes(1)
  })

  it('shows the German error and does not refresh when preparation fails', async () => {
    preparePhotoFile.mockRejectedValue(new Error('HEIC konnte nicht umgewandelt werden.'))
    const onUploaded = vi.fn()
    const { Uploader } = await import('@/components/uploader')
    const { container } = render(<Uploader onUploaded={onUploaded} />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    await userEvent.upload(input, new File(['heic'], 'bild.heic', { type: 'image/heic' }))
    expect(await screen.findByText('HEIC konnte nicht umgewandelt werden.')).toBeTruthy()
    expect(onUploaded).not.toHaveBeenCalled()
  })
})
