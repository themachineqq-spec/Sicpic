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
    render(<AdminMembers members={[self, other]} selfId={self.id} />)
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
    render(<AdminMembers members={[self]} selfId={self.id} />)
    await userEvent.type(screen.getByRole('textbox', { name: 'E-Mail' }), 'ada@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Zur Liste hinzufügen' }))
    expect(await screen.findByText('Diese Adresse steht schon auf der Liste.')).toBeTruthy()
  })
})
