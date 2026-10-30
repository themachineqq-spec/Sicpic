import { vi } from 'vitest'

export const routerMocks = {
  refresh: vi.fn(),
  replace: vi.fn(),
  push: vi.fn(),
  pathname: '/',
}
