const PREFIX = 'sicpic:v1:'
const STALE_MS = 30_000
const MAX_CHARS = 180_000

type Entry = { at: number; data: unknown }

const memory = new Map<string, Entry>()

function storage(): Storage | null {
  try {
    if (typeof sessionStorage === 'undefined') return null
    return sessionStorage
  } catch {
    return null
  }
}

export function readSessionCache<T>(key: string, now = Date.now()): { data: T; stale: boolean } | null {
  const cached = memory.get(key)
  if (cached) return { data: cached.data as T, stale: now - cached.at > STALE_MS }
  const store = storage()
  if (!store) return null
  try {
    const raw = store.getItem(PREFIX + key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Entry
    if (!parsed || typeof parsed.at !== 'number' || !('data' in parsed)) return null
    memory.set(key, parsed)
    return { data: parsed.data as T, stale: now - parsed.at > STALE_MS }
  } catch {
    return null
  }
}

export function writeSessionCache<T>(key: string, data: T, now = Date.now()): void {
  const entry: Entry = { at: now, data }
  memory.set(key, entry)
  const store = storage()
  if (!store) return
  try {
    const raw = JSON.stringify(entry)
    if (raw.length > MAX_CHARS) return
    store.setItem(PREFIX + key, raw)
  } catch {
    // A full session store must not break the gallery. Memory still has the page.
  }
}

export function invalidateSessionCache(prefix: string): void {
  for (const key of [...memory.keys()]) {
    if (key.startsWith(prefix)) memory.delete(key)
  }
  const store = storage()
  if (!store) return
  const full = PREFIX + prefix
  try {
    const keys: string[] = []
    for (let index = 0; index < store.length; index += 1) {
      const name = store.key(index)
      if (name?.startsWith(full)) keys.push(name)
    }
    for (const name of keys) store.removeItem(name)
  } catch {
    // Ignore storage failures. The in-memory map is already cleared.
  }
}

export function resetSessionCache(): void {
  memory.clear()
}
