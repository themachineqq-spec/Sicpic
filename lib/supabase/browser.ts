import { createBrowserClient } from '@supabase/ssr'
import { isSupabaseConfigured } from '@/lib/config'

export function createBrowserSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!isSupabaseConfigured() || !url || !key) return null
  return createBrowserClient(url, key)
}
