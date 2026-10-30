import { errorResponse, json } from '@/lib/http'
import { createClient } from '@/lib/supabase/server'

export async function POST() {
  try {
    const supabase = await createClient()
    await supabase.auth.signOut()
    return json({ ok: true })
  } catch (error) {
    return errorResponse(error)
  }
}
