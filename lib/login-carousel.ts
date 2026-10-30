export const CAROUSEL_INTERVAL_MS = 5000

export type LoginSlide = {
  src: string
  alt: string
}

export const loginSlides: readonly LoginSlide[] = [
  { src: '/carousel/strand.webp', alt: 'Küste im Abendlicht' },
  { src: '/carousel/strasse.webp', alt: 'Gelber Van auf einer Reise-Straße' },
  { src: '/carousel/berge.webp', alt: 'Berglandschaft' },
  { src: '/carousel/ort.webp', alt: 'Ort über Weinbergen und einem See' },
  { src: '/carousel/wasser.webp', alt: 'Klares blaues Wasser' },
  { src: '/carousel/sonnenuntergang.webp', alt: 'Berge am Wasser bei Sonnenuntergang' },
]

export function nextCarouselIndex(current: number, total = loginSlides.length): number {
  if (total <= 1) return 0
  const normalized = ((current % total) + total) % total
  return (normalized + 1) % total
}
