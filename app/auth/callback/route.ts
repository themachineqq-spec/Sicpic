import { NextResponse } from 'next/server'
import { linkOrBootstrapMember } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

function safeNext(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/auth')) return '/gruppe'
  return value
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const next = safeNext(url.searchParams.get('next'))
  const failure = new URL('/', url.origin)
  failure.searchParams.set('fehler', 'anmeldung')

  if (!code) return NextResponse.redirect(failure)

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) return NextResponse.redirect(failure)

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(failure)

  try {
    const member = await linkOrBootstrapMember(user)
    if (!member) {
      await supabase.auth.signOut()
      return NextResponse.redirect(new URL('/nicht-eingeladen', url.origin))
    }
  } catch (caught) {
    console.error(caught)
    failure.searchParams.set('fehler', 'config')
    return NextResponse.redirect(failure)
  }

  return NextResponse.redirect(new URL(next, url.origin))
}
