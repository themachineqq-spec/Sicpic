import { describe, expect, it } from 'vitest'
import { AppError } from '@/lib/errors'
import { assertEmail, mapMember, normalizeEmail } from '@/lib/member'

describe('members', () => {
  it('normalizes email and falls back to the local part', () => {
    expect(normalizeEmail('  Ada@Example.com ')).toBe('ada@example.com')
    expect(assertEmail('ada@example.com')).toBe('ada@example.com')
    expect(() => assertEmail('nope')).toThrow(AppError)
    expect(
      mapMember({
        id: '11111111-1111-4111-8111-111111111111',
        user_id: null,
        email: 'Ada@Example.com',
        display_name: '  ',
        role: 'editor',
      }).displayName,
    ).toBe('ada')
    expect(mapMember({ id: '1', user_id: '2', email: 'a@b.co', display_name: 'Ada', role: 'admin' }).role).toBe('admin')
  })
})
