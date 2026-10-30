import { describe, expect, it } from 'vitest'
import { assertDisplayName, displayNameFromGoogle } from '@/lib/display-name'

describe('display names', () => {
  it('trims a name and rejects empty, long, and control characters', () => {
    expect(assertDisplayName('  Reise  ')).toBe('Reise')
    expect(() => assertDisplayName('   ')).toThrow(/fehlt/)
    expect(() => assertDisplayName('a'.repeat(81))).toThrow(/zu lang/)
    expect(() => assertDisplayName('Ada\nBea')).toThrow(/ungültige Zeichen/)
    expect(() => assertDisplayName('Ada\u007f')).toThrow(/ungültige Zeichen/)
    expect(assertDisplayName('a'.repeat(80))).toHaveLength(80)
  })

  it('prefers a cleaned Google name and falls back to the mailbox', () => {
    expect(displayNameFromGoogle('  Cara\nGoogle  ', 'cara@example.com')).toBe('CaraGoogle')
    expect(displayNameFromGoogle('   ', 'cara@example.com')).toBe('cara')
    expect(displayNameFromGoogle(12, 'cara@example.com')).toBe('cara')
    expect(displayNameFromGoogle('', '')).toBe('Mitglied')
  })
})
