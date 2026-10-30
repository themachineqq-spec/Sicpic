// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({
  signInWithOAuth: vi.fn(async () => ({ error: null as { message: string } | null })),
  client: true,
}))

vi.mock('next/image', () => ({
  default: ({ src, className }: { src: string; className?: string }) => (
    // The test double is not a page image.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className={className} />
  ),
}))

vi.mock('@/lib/supabase/browser', () => ({
  createBrowserSupabase: () => (auth.client ? { auth: { signInWithOAuth: auth.signInWithOAuth } } : null),
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

describe('LoginScreen', () => {
  beforeEach(() => {
    mockMotion(true)
    auth.client = true
    auth.signInWithOAuth.mockClear()
    auth.signInWithOAuth.mockResolvedValue({ error: null })
    process.env.NEXT_PUBLIC_APP_URL = 'https://sicpic.example'
    window.history.pushState({}, '', '/')
  })

  afterEach(() => {
    cleanup()
  })

  it('shows the headline and keeps the button off until supabase is configured', async () => {
    const { LoginScreen } = await import('@/components/login-screen')
    render(<LoginScreen configured={false} notice="Anmeldung fehlgeschlagen" />)
    expect(screen.getByRole('heading', { name: 'Urlaubs-Fotos an einem Ort' })).toBeTruthy()
    expect(screen.getByText('Anmeldung fehlgeschlagen')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Mit Google anmelden/ }).hasAttribute('disabled')).toBe(true)
  })

  it('starts Google sign-in against NEXT_PUBLIC_APP_URL and only keeps a local next path', async () => {
    window.history.pushState({}, '', '/?next=/ordner')
    const { LoginScreen } = await import('@/components/login-screen')
    render(<LoginScreen configured />)
    await userEvent.click(screen.getByRole('button', { name: 'Mit Google anmelden' }))
    expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: 'https://sicpic.example/auth/callback?next=%2Fordner',
        queryParams: { prompt: 'select_account' },
      },
    })
    expect(screen.getByRole('button', { name: 'Weiter zu Google…' })).toBeTruthy()
  })

  it('shows a German error when Google or the client is unavailable', async () => {
    auth.signInWithOAuth.mockResolvedValue({ error: { message: 'secret' } })
    const { LoginScreen } = await import('@/components/login-screen')
    const { rerender } = render(<LoginScreen configured />)
    await userEvent.click(screen.getByRole('button', { name: 'Mit Google anmelden' }))
    expect(screen.getByText('Die Anmeldung konnte nicht gestartet werden.')).toBeTruthy()
    expect(screen.queryByText('secret')).toBeNull()
    auth.client = false
    rerender(<LoginScreen configured />)
    await userEvent.click(screen.getByRole('button', { name: 'Mit Google anmelden' }))
    expect(screen.getByText('Supabase ist noch nicht konfiguriert.')).toBeTruthy()
  })
})
