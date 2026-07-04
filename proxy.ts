import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE } from '@/lib/auth/constants'

const PRIVATE_PREFIXES = ['/dashboard', '/vehiculos', '/perfil', '/facturacion']

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl
  const isPrivate = PRIVATE_PREFIXES.some((p) => pathname.startsWith(p))
  if (!isPrivate) return NextResponse.next()
  const hasSession = req.cookies.has(SESSION_COOKIE)
  if (!hasSession) {
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*', '/vehiculos/:path*', '/perfil/:path*', '/facturacion/:path*'],
}
