import { describe, expect, it } from 'vitest'
import {
  filterRangeInstants,
  filtersToQuery,
  galleryCacheKey,
  indexPhotos,
  parseApiListFilter,
  parseGalleryFilters,
  selectPhotos,
} from '@/lib/gallery-filters'
import type { GalleryPhoto } from '@/lib/types'

const ada = '11111111-1111-4111-8111-111111111111'
const bea = '33333333-3333-4333-8333-333333333333'

function photo(patch: Partial<GalleryPhoto>): GalleryPhoto {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    ownerId: ada,
    filename: 'strand.jpg',
    contentType: 'image/jpeg',
    byteSize: 10,
    width: 10,
    height: 8,
    capturedAt: '2024-07-01T13:30:45.000Z',
    createdAt: '2024-07-02T00:00:00.000Z',
    uploaderName: 'Ada',
    thumbUrl: '/a',
    ...patch,
  }
}

const july = photo({})
const june = photo({
  id: '55555555-5555-4555-8555-555555555555',
  ownerId: bea,
  filename: 'berge.jpg',
  capturedAt: '2024-06-01T10:00:00.000Z',
  uploaderName: 'Bea',
  mediaType: 'video',
})

describe('gallery filters', () => {
  it('parses the url and ignores values that are not a person or a day', () => {
    const filters = parseGalleryFilters(new URLSearchParams(`type=video&person=${bea}&from=2024-06-01&to=2024-07-02`))
    expect(filters).toEqual({ media: 'video', ownerId: bea, from: '2024-06-01', to: '2024-07-02' })
    expect(parseGalleryFilters(new URLSearchParams('type=nope&person=ada&from=July&to=2024-7-1')).media).toBe('all')
    expect(filtersToQuery(filters)).toBe(`type=video&person=${bea}&from=2024-06-01&to=2024-07-02`)
    expect(filtersToQuery({ media: 'all', ownerId: null, from: null, to: null })).toBe('')
    expect(parseApiListFilter(new URLSearchParams('from=not-a-date'))).toBeNull()
    expect(parseApiListFilter(new URLSearchParams(`owner=${ada}&from=2024-06-30T22:00:00.000Z`))).toEqual({
      ownerId: ada,
      from: '2024-06-30T22:00:00.000Z',
      to: null,
    })
    expect(filterRangeInstants({ media: 'all', ownerId: null, from: '2024-07-01', to: '2024-07-01' })).toEqual({
      from: '2024-06-30T22:00:00.000Z',
      to: '2024-07-01T22:00:00.000Z',
    })
    expect(galleryCacheKey('group')).toBe('gallery:group:all:::')
  })

  it('selects from a precomputed index without reordering', () => {
    const index = indexPhotos([july, june])
    expect(index.owners.map((person) => person.name)).toEqual(['Ada', 'Bea'])
    expect(selectPhotos(index, { media: 'all', ownerId: null, from: null, to: null }).map((item) => item.id)).toEqual([
      july.id,
      june.id,
    ])
    expect(selectPhotos(index, { media: 'video', ownerId: null, from: null, to: null }).map((item) => item.filename)).toEqual([
      'berge.jpg',
    ])
    expect(selectPhotos(index, { media: 'photo', ownerId: bea, from: null, to: null })).toEqual([])
    expect(selectPhotos(index, { media: 'all', ownerId: ada, from: '2024-07-01', to: '2024-07-01' }).map((item) => item.id)).toEqual([
      july.id,
    ])
    expect(selectPhotos(index, { media: 'video', ownerId: bea, from: '2024-06-01', to: '2024-06-01' }).map((item) => item.id)).toEqual([
      june.id,
    ])
  })
})
