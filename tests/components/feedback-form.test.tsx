// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => vi.fn())
const putWithProgress = vi.hoisted(() => vi.fn(async () => undefined))

vi.mock('@/lib/api-client', () => ({ api }))
vi.mock('@/lib/browser-upload', () => ({ putWithProgress }))

describe('FeedbackForm', () => {
  afterEach(() => {
    cleanup()
    api.mockReset()
    putWithProgress.mockClear()
  })

  it('sends a wish without a screenshot', async () => {
    api.mockResolvedValue({ id: '44444444-4444-4444-8444-444444444444' })
    const { FeedbackForm } = await import('@/components/feedback-form')
    render(<FeedbackForm />)
    await userEvent.click(screen.getByText('Wunsch'))
    await userEvent.type(screen.getByRole('textbox', { name: 'Titel' }), 'Karte')
    await userEvent.type(screen.getByRole('textbox', { name: 'Beschreibung' }), 'Bitte eine Karte')
    await userEvent.click(screen.getByRole('button', { name: 'Senden' }))
    expect(await screen.findByText('Danke. Die Rückmeldung ist angekommen.')).toBeTruthy()
    expect(putWithProgress).not.toHaveBeenCalled()
    expect(api).toHaveBeenCalledWith('/api/feedback', expect.objectContaining({ method: 'POST' }))
    const body = JSON.parse(String(api.mock.calls[0]?.[1]?.body))
    expect(body.kind).toBe('feature')
    expect(body.screenshotContentType).toBeNull()
  })

  it('uploads a screenshot before the feedback row is stored', async () => {
    api.mockImplementation(async (path: string) => {
      if (path === '/api/feedback/uploads') {
        return {
          feedbackId: '55555555-5555-4555-8555-555555555555',
          url: '/put/screenshot',
          contentType: 'image/png',
        }
      }
      return { id: '55555555-5555-4555-8555-555555555555' }
    })
    const { FeedbackForm } = await import('@/components/feedback-form')
    render(<FeedbackForm />)
    await userEvent.type(screen.getByRole('textbox', { name: 'Titel' }), 'Fehler')
    await userEvent.type(screen.getByRole('textbox', { name: 'Beschreibung' }), 'Die Vorschau fehlt')
    await userEvent.upload(screen.getByLabelText(/Screenshot/), new File(['png'], 'shot.png', { type: 'image/png' }))
    await userEvent.click(screen.getByRole('button', { name: 'Senden' }))
    expect(await screen.findByText('Danke. Die Rückmeldung ist angekommen.')).toBeTruthy()
    expect(putWithProgress).toHaveBeenCalledWith('/put/screenshot', expect.any(File), 'image/png', expect.any(Function))
    const stored = JSON.parse(String(api.mock.calls[1]?.[1]?.body))
    expect(stored.id).toBe('55555555-5555-4555-8555-555555555555')
    expect(stored.screenshotContentType).toBe('image/png')
  })

  it('shows the server message when sending fails', async () => {
    api.mockRejectedValue(new Error('Bitte melde dich an.'))
    const { FeedbackForm } = await import('@/components/feedback-form')
    render(<FeedbackForm />)
    await userEvent.type(screen.getByRole('textbox', { name: 'Titel' }), 'Fehler')
    await userEvent.type(screen.getByRole('textbox', { name: 'Beschreibung' }), 'Geht nicht')
    await userEvent.click(screen.getByRole('button', { name: 'Senden' }))
    expect(await screen.findByText('Bitte melde dich an.')).toBeTruthy()
  })
})
