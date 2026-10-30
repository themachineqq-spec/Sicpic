import { AppError } from '@/lib/errors'

const CONTROL = /[\u0000-\u001F\u007F-\u009F]/

export function assertDisplayName(value: string): string {
  const name = value.trim()
  if (name.length < 1) throw new AppError(400, 'bad_request', 'Der Anzeigename fehlt.')
  if (name.length > 80) throw new AppError(400, 'bad_request', 'Der Anzeigename ist zu lang.')
  if (CONTROL.test(name)) throw new AppError(400, 'bad_request', 'Der Anzeigename enthält ungültige Zeichen.')
  return name
}

export function displayNameFromGoogle(raw: unknown, email: string): string {
  const text = typeof raw === 'string' ? raw.replace(CONTROL, '').trim().slice(0, 80) : ''
  if (text.length >= 1) return text
  const local = email.split('@')[0]?.replace(CONTROL, '').trim().slice(0, 80)
  return local || email.replace(CONTROL, '').trim().slice(0, 80) || 'Mitglied'
}
