import 'server-only'

import { createClient } from '@supabase/supabase-js'
import { AppError } from '@/lib/errors'

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new AppError(500, 'config', 'Der Supabase-Service-Schlüssel fehlt auf dem Server.')
  }
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}
