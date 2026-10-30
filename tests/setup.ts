import { vi } from 'vitest'

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    getAll: () => [],
    set: () => undefined,
    get: () => undefined,
  })),
  headers: vi.fn(async () => new Headers()),
}))

vi.mock('next/navigation', async () => {
  const { routerMocks } = await import('./mocks/navigation')
  return {
    redirect: (url: string) => {
      throw new Error(`REDIRECT:${url}`)
    },
    useRouter: () => routerMocks,
    usePathname: () => routerMocks.pathname,
  }
})
