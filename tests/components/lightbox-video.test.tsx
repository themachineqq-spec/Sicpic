// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GalleryPhoto } from '@/lib/types'

const video: GalleryPhoto = {
  id: '44444444-4444-4444-8444-444444444444',
  ownerId: '11111111-1111-4111-8111-111111111111',
  filename: 'clip.mov',
  contentType: 'video/quicktime',
  byteSize: 10,
  width: 1920,
  height: 1080,
  capturedAt: '2024-07-01T13:30:45.000Z',
  createdAt: '2024-07-02T00:00:00.000Z',
  uploaderName: 'Ada',
  thumbUrl: '',
  mediaType: 'video',
  durationMs: 4000,
  codec: 'hevc',
}

describe('video playback', () => {
  afterEach(() => cleanup())

  it('explains an unsupported codec and offers a download', async () => {
    const onDownload = vi.fn(async () => 'https://signed.example/clip.mov')
    const { Lightbox } = await import('@/components/lightbox')
    render(
      <Lightbox
        photos={[video]}
        index={0}
        src="https://signed.example/play"
        error={null}
        onClose={() => undefined}
        onIndex={() => undefined}
        onDownload={onDownload}
      />,
    )
    const player = document.querySelector('video')
    expect(player?.getAttribute('playsinline')).toBe('')
    expect(player?.getAttribute('preload')).toBe('metadata')
    if (!player) throw new Error('video missing')
    Object.defineProperty(player, 'error', { configurable: true, value: { code: 4 } })
    fireEvent.error(player)
    expect(await screen.findByText(/nicht abspielen/)).toBeTruthy()
    expect(await screen.findByRole('link', { name: 'Herunterladen' })).toHaveProperty('href', 'https://signed.example/clip.mov')
    expect(onDownload).toHaveBeenCalled()
  })
})
