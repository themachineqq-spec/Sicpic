import { cookies, headers } from 'next/headers'
import type { Member } from '@/lib/types'

export const E2E_MEMBER_ID = '11111111-1111-4111-8111-111111111111'
export const E2E_USER_ID = '22222222-2222-4222-8222-222222222222'

export function isE2EAuthEnabled(): boolean {
  if (process.env.SICPIC_E2E_AUTH !== '1' || process.env.SICPIC_E2E_LOCAL !== '1') return false
  if (process.env.NETLIFY === 'true' || process.env.NETLIFY === '1') return false
  if (process.env.CONTEXT === 'production' || process.env.CONTEXT === 'deploy-preview' || process.env.CONTEXT === 'branch-deploy') {
    return false
  }
  return true
}

export function isLoopbackHost(host: string | null | undefined): boolean {
  const hostname = (host ?? '').split(',')[0]?.trim().split(':')[0] ?? ''
  return hostname === 'localhost' || hostname === '127.0.0.1'
}

export function e2eMemberFromCookies(token: string | undefined, role: string | undefined, expectedToken: string | undefined): {
  session: { userId: string } | null
  member: Member | null
} {
  if (!token || !expectedToken || token !== expectedToken) {
    return { session: null, member: null }
  }
  const memberRole = role === 'admin' ? 'admin' : 'member'
  return {
    session: { userId: E2E_USER_ID },
    member: {
      id: E2E_MEMBER_ID,
      userId: E2E_USER_ID,
      email: 'e2e@example.com',
      displayName: 'E2E',
      role: memberRole,
    },
  }
}

export async function isE2ERequest(): Promise<boolean> {
  if (!isE2EAuthEnabled()) return false
  try {
    const host = (await headers()).get('host')
    return isLoopbackHost(host)
  } catch {
    return false
  }
}

export async function e2eAccessOverride(): Promise<{ session: { userId: string } | null; member: Member | null } | null> {
  if (!(await isE2ERequest())) return null
  const jar = await cookies()
  return e2eMemberFromCookies(jar.get('sicpic-e2e')?.value, jar.get('sicpic-e2e-role')?.value, process.env.SICPIC_E2E_TOKEN)
}
