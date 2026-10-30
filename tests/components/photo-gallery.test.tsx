// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GalleryPhoto } from '@/lib/types'
import { routerMocks } from '@/tests/mocks/navigation'

const api = vi.hoisted(() => vi.fn())

vi.mock('@/lib/api-client', () => ({ api }))
vi.mock('@/components/uploader', () => ({
  Uploader: ({ onUploaded }: { onUploaded: () => void }) => (
    <button type="button" onClick={onUploaded}>
      Upload fertig
    </button>
  ),
}))

const photoA: GalleryPhoto = {
  id: '44444444-4444-4444-8444-444444444444',
  ownerId: '11111111-1111-4111-8111-111111111111',
  filename: 'strand.jpg',
  contentType: 'image/jpeg',
  byteSize: 10,
  width: 10,
  height: 8,
  capturedAt: '2024-07-01T13:30:45.000Z',
  createdAt: '2024-07-02T00:00:00.000Z',
  uploaderName: 'Ada',
  thumbUrl: '/thumb-a.jpg',
}

const photoB: GalleryPhoto = {
  ...photoA,
  id: '55555555-5555-4555-8555-555555555555',
  filename: 'berge.jpg',
  capturedAt: '2024-06-01T10:00:00.000Z',
  uploaderName: 'Bea',
  thumbUrl: '/thumb-b.jpg',
}

describe('PhotoGallery', () => {
  beforeEach(() => {
    api.mockReset()
    routerMocks.refresh.mockClear()
    class Observer {
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal('IntersectionObserver', Observer)
  })

  afterEach(() => {
    cleanup()
  })

  it('groups the shared timeline and opens the signed display image', async () => {
    api.mockResolvedValue({ url: 'https://signed.example/display.jpg' })
    const { PhotoGallery } = await import('@/components/photo-gallery')
    render(
      <PhotoGallery
        scope="group"
        title="Gruppe"
        intro="Alle Fotos"
        initial={[photoA, photoB]}
        initialCursor={null}
        canDelete={false}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Juli 2024' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Juni 2024' })).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Ada: strand.jpg' }))
    expect(await screen.findByRole('dialog', { name: 'strand.jpg' })).toBeTruthy()
    expect(api).toHaveBeenCalledWith(`/api/photos/${photoA.id}/url?variant=display`)
  })

  it('loads older photos, deletes only after confirmation and refreshes a broken thumbnail', async () => {
    api.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path.includes('cursor=')) return { photos: [photoB], nextCursor: null }
      if (init?.method === 'DELETE') return { ok: true }
      if (path.includes('variant=thumb')) return { url: '/thumb-new.jpg' }
      if (path.includes('variant=display')) throw new Error('Bild weg')
      return { url: '/thumb-new.jpg' }
    })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { PhotoGallery } = await import('@/components/photo-gallery')
    render(
      <PhotoGallery
        scope="mine"
        title="Mein Ordner"
        intro="Nur deine Fotos"
        initial={[photoA]}
        initialCursor="2024-07-01T13:30:45.000Z|44444444-4444-4444-8444-444444444444"
        canDelete
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Ältere Fotos laden' }))
    expect(await screen.findByRole('img', { name: 'Bea: berge.jpg' })).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'strand.jpg löschen' }))
    expect(screen.queryByRole('img', { name: 'Ada: strand.jpg' })).toBeNull()
    expect(routerMocks.refresh).toHaveBeenCalled()
    fireEvent.error(screen.getByRole('img', { name: 'Bea: berge.jpg' }))
    await waitFor(() => {
      expect(screen.getByRole('img', { name: 'Bea: berge.jpg' }).getAttribute('src')).toContain('thumb-new.jpg')
    })
    await userEvent.click(screen.getByRole('button', { name: 'Upload fertig' }))
    expect(routerMocks.refresh).toHaveBeenCalledTimes(2)
  })

  it('shows the empty folder and a failed delete', async () => {
    api.mockRejectedValue(new Error('Löschen fehlgeschlagen.'))
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { PhotoGallery } = await import('@/components/photo-gallery')
    const { rerender } = render(
      <PhotoGallery scope="mine" title="Mein Ordner" intro="Leer" initial={[]} initialCursor={null} canDelete />,
    )
    expect(screen.getByText(/Dein Ordner ist noch leer/)).toBeTruthy()
    rerender(
      <PhotoGallery scope="group" title="Gruppe" intro="Leer" initial={[]} initialCursor={null} canDelete={false} />,
    )
    expect(screen.getByText(/Noch keine Fotos/)).toBeTruthy()
    rerender(
      <PhotoGallery scope="mine" title="Mein Ordner" intro="Eins" initial={[photoA]} initialCursor={null} canDelete />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'strand.jpg löschen' }))
    expect(await screen.findByText('Löschen fehlgeschlagen.')).toBeTruthy()
  })
})
