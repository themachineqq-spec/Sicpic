// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CAROUSEL_INTERVAL_MS } from '@/lib/login-carousel'

vi.mock('next/image', () => ({
  default: ({ src, className }: { src: string; className?: string }) => (
    // The test double is not a page image.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className={className} />
  ),
}))

function mockMotion(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: () => ({
      matches,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  })
}

describe('LoginCarousel', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('crossfades to the next photo after five seconds and pauses when motion is reduced', async () => {
    mockMotion(false)
    const { LoginCarousel } = await import('@/components/login-carousel')
    const { container, unmount } = render(<LoginCarousel />)
    const visible = () => [...container.querySelectorAll('img')].find((image) => image.className.includes('opacity-100'))
    expect(visible()?.getAttribute('src')).toBe('/carousel/strand.webp')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CAROUSEL_INTERVAL_MS)
    })
    expect(visible()?.getAttribute('src')).toBe('/carousel/strasse.webp')
    unmount()

    mockMotion(true)
    const paused = render(<LoginCarousel />)
    const pausedVisible = () => [...paused.container.querySelectorAll('img')].find((image) => image.className.includes('opacity-100'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CAROUSEL_INTERVAL_MS * 3)
    })
    expect(pausedVisible()?.getAttribute('src')).toBe('/carousel/strand.webp')
  })
})
