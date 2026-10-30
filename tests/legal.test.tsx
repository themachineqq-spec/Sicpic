// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import PrivacyPage from '@/app/datenschutz/page'
import TermsPage from '@/app/nutzungsbedingungen/page'

describe('public legal pages', () => {
  it('explains the private group without asking for a login', () => {
    const { unmount } = render(PrivacyPage())
    expect(screen.getByRole('heading', { name: 'Datenschutz' })).toBeTruthy()
    expect(screen.getByText(/nur Name und E-Mail/)).toBeTruthy()
    expect(screen.getByText(/Cloudflare-R2-Speicher in der EU/)).toBeTruthy()
    expect(screen.getByText(/Netlify/)).toBeTruthy()
    expect(screen.getByText(/keine Tracker/i)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'themachineqq@gmail.com' }).getAttribute('href')).toBe(
      'mailto:themachineqq@gmail.com',
    )
    unmount()
    render(TermsPage())
    expect(screen.getByRole('heading', { name: 'Nutzungsbedingungen' })).toBeTruthy()
    expect(screen.getByText(/nur eigene Fotos und Videos/)).toBeTruthy()
    expect(screen.getByText(/Admin-Person kann Mitglieder entfernen/)).toBeTruthy()
  })
})
