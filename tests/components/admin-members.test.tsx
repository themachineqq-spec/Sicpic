// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Member } from '@/lib/types'
import { routerMocks } from '@/tests/mocks/navigation'

const api = vi.hoisted(() => vi.fn())

vi.mock('@/lib/api-client', () => ({ api }))

const self: Member = {
  id: '11111111-1111-4111-8111-111111111111',
  userId: '22222222-2222-4222-8222-222222222222',
  email: 'ada@example.com',
  displayName: 'Ada',
  role: 'admin',
}

const other: Member = {
  id: '33333333-3333-4333-8333-333333333333',
  userId: null,
  email: 'bea@example.com',
  displayName: 'Bea',
  role: 'member',
}

describe('AdminMembers', () => {
  afterEach(() => {
    cleanup()
    api.mockReset()
    routerMocks.refresh.mockClear()
  })

  it('adds a member, changes a role and removes someone else', async () => {
    api.mockResolvedValue({ ok: true })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { AdminMembers } = await import('@/components/admin-members')
    render(<AdminMembers members={[self, other]} invites={[]} selfId={self.id} />)
    expect(screen.getByText('Das bist du')).toBeTruthy()
    await userEvent.type(screen.getByRole('textbox', { name: 'E-Mail' }), 'cara@example.com')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Rolle' }), 'admin')
    await userEvent.click(screen.getByRole('button', { name: 'Zur Liste hinzufügen' }))
    expect(api).toHaveBeenCalledWith('/api/members', expect.objectContaining({ method: 'POST' }))
    expect(routerMocks.refresh).toHaveBeenCalled()
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Rolle von Bea' }), 'admin')
    expect(api).toHaveBeenCalledWith(`/api/members/${other.id}`, expect.objectContaining({ method: 'PATCH' }))
    await userEvent.click(screen.getByRole('button', { name: 'Entfernen' }))
    expect(api).toHaveBeenCalledWith(`/api/members/${other.id}`, expect.objectContaining({ method: 'DELETE' }))
  })

  it('shows the German error when the invite is rejected', async () => {
    api.mockRejectedValue(new Error('Diese Adresse steht schon auf der Liste.'))
    const { AdminMembers } = await import('@/components/admin-members')
    render(<AdminMembers members={[self]} invites={[]} selfId={self.id} />)
    await userEvent.type(screen.getByRole('textbox', { name: 'E-Mail' }), 'ada@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Zur Liste hinzufügen' }))
    expect(await screen.findByText('Diese Adresse steht schon auf der Liste.')).toBeTruthy()
  })

  it('creates a link, copies it when sharing is unavailable, and revokes an open invite', async () => {
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined })
    api.mockResolvedValueOnce({ invite: { url: 'https://sicpic.example/einladung/token' } })
    api.mockResolvedValueOnce({ ok: true })
    const { AdminMembers } = await import('@/components/admin-members')
    render(
      <AdminMembers
        members={[self]}
        invites={[
          {
            id: '66666666-6666-4666-8666-666666666666',
            displayName: null,
            role: 'member',
            createdAt: '2026-10-30T00:00:00.000Z',
            expiresAt: '2026-11-06T00:00:00.000Z',
          },
        ]}
        selfId={self.id}
      />,
    )
    expect(screen.getByText('Ohne Namen')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Einladungslink erstellen' }))
    expect(api).toHaveBeenCalledWith('/api/invites', expect.objectContaining({ method: 'POST' }))
    expect(writeText).toHaveBeenCalledWith('https://sicpic.example/einladung/token')
    expect(await screen.findByText('Link kopiert.')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Zurückziehen' }))
    expect(api).toHaveBeenCalledWith('/api/invites/66666666-6666-4666-8666-666666666666', expect.objectContaining({ method: 'DELETE' }))
  })
})
