import { describe, expect, it } from 'vitest'
import { CAROUSEL_INTERVAL_MS, loginSlides, nextCarouselIndex } from '@/lib/login-carousel'

describe('login carousel', () => {
  it('advances every 5 seconds and loops after the last slide', () => {
    expect(CAROUSEL_INTERVAL_MS).toBe(5000)
    expect(loginSlides).toHaveLength(6)
    expect(nextCarouselIndex(0)).toBe(1)
    expect(nextCarouselIndex(4)).toBe(5)
    expect(nextCarouselIndex(loginSlides.length - 1)).toBe(0)
    expect(nextCarouselIndex(4, 1)).toBe(0)
    expect(nextCarouselIndex(-1, 6)).toBe(0)
  })
})
