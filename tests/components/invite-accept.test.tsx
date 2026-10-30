// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({
  signInWithOAuth: vi.fn(async () => ({ error: null as { message: string } | null })),
  client: true,
}))

vi.mock('@/lib/supabase/browser', () => ({
  createBrowserSupabase: () => (auth.client ? { auth: { signInWithOAuth: auth.signInWithOAuth } } : null),
}))

describe('InviteAccept', () => {
  afterEach(() => {
    cleanup()
    auth.client = true
    auth.signInWithOAuth.mockReset()
    auth.signInWithOAuth.mockResolvedValue({ error: null })
    vi.unstubAllGlobals()
  })

  it('stores the token in a cookie and starts Google on the same origin', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://sicpic.example'
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const { InviteAccept } = await import('@/components/invite-accept')
    render(<InviteAccept token="plain-token" e2e={false} />)
    await userEvent.click(screen.getByRole('button', { name: 'Mit Google anmelden' }))
    expect(fetchMock).toHaveBeenCalledWith('/api/invites/prepare', expect.objectContaining({ method: 'POST' }))
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit] | undefined
    expect(String(call?.[1]?.body)).toContain('plain-token')
    expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: {
        redirectTo: 'https://sicpic.example/auth/callback?next=%2Fgruppe',
        queryParams: { prompt: 'select_account' },
      },
    })
  })

  it('shows one German error and uses the local callback in e2e', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ message: 'Diese Einladung ist nicht gültig.' }), { status: 400 }))
    vi.stubGlobal('fetch', fetchMock)
    const { InviteAccept } = await import('@/components/invite-accept')
    const { rerender } = render(<InviteAccept token="plain-token" e2e={false} />)
    await userEvent.click(screen.getByRole('button', { name: 'Mit Google anmelden' }))
    expect(await screen.findByText('Diese Einladung ist nicht gültig.')).toBeTruthy()
    expect(auth.signInWithOAuth).not.toHaveBeenCalled()

    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    const submit = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(() => undefined)
    rerender(<InviteAccept token="plain-token" e2e />)
    await userEvent.click(screen.getByRole('button', { name: 'Mit Google anmelden' }))
    expect(submit).toHaveBeenCalled()
    expect(document.querySelector('form')?.getAttribute('action')).toBe('/auth/callback')
    submit.mockRestore()
  })

  it('stops when Supabase or Google cannot start', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    auth.client = false
    const { InviteAccept } = await import('@/components/invite-accept')
    const view = render(<InviteAccept token="plain-token" e2e={false} />)
    await userEvent.click(screen.getByRole('button', { name: 'Mit Google anmelden' }))
    expect(await screen.findByText('Supabase ist noch nicht konfiguriert.')).toBeTruthy()
    auth.client = true
    auth.signInWithOAuth.mockResolvedValue({ error: { message: 'secret' } })
    view.rerender(<InviteAccept token="plain-token" e2e={false} />)
    await userEvent.click(screen.getByRole('button', { name: 'Mit Google anmelden' }))
    expect(await screen.findByText('Die Anmeldung konnte nicht gestartet werden.')).toBeTruthy()
    expect(screen.queryByText('secret')).toBeNull()
  })
})
