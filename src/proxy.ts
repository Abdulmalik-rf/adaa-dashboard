import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase/config'

const PUBLIC_PATHS = ['/login', '/auth/callback']
const USER_ALLOWED_PATHS = ['/my-dashboard', '/my-tasks', '/notifications']

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

function isUserAllowed(pathname: string) {
  return USER_ALLOWED_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const response = NextResponse.next({ request })

  // Expose the pathname to server components that need it
  response.headers.set('x-pathname', pathname)

  if (isPublic(pathname)) return response

  const supabase = createServerClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Fast path: user-allowed paths are reachable by everyone authenticated.
  // Skip role lookup entirely. This eliminates the second Supabase round-trip
  // on the most-visited pages (/my-dashboard, /my-tasks, /notifications).
  if (isUserAllowed(pathname)) return response

  // For admin-restricted paths, read role from app_metadata (already in the
  // JWT — no DB round-trip needed). Falls back to a profiles query only if
  // app_metadata is unset (legacy users who pre-date the migration).
  let role: string | undefined = (user.app_metadata as any)?.role
  if (!role) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()
    role = profile?.role || 'user'
  }

  if (role !== 'admin') {
    const url = request.nextUrl.clone()
    url.pathname = '/my-dashboard'
    return NextResponse.redirect(url)
  }

  return response
}

export const config = {
  matcher: [
    // Run on all paths except static assets, images, favicon, api internals
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico)$).*)',
  ],
}
