import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const demoToken = searchParams.get('demo_token')
  const next = searchParams.get('next') ?? '/auth/confirmed'

  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              )
            } catch { }
          },
        },
      }
    )
    const { data: sessionData, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // Claim the demo session if a token was threaded through the signup URL.
      // Best-effort — a failure here should never block the user from signing in.
      if (demoToken && sessionData?.session?.access_token) {
        try {
          const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'https://api.draftai.us'
          await fetch(`${apiBase}/demo/claim`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${sessionData.session.access_token}`,
            },
            body: JSON.stringify({ demo_token: demoToken }),
          })
        } catch {
          // TODO: fire and forget log error
        }
      }

      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/auth/auth-code-error`)
}
