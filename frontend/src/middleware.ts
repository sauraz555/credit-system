import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Bypass public or static routes
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/403') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get('auth_token')?.value;
  const role = request.cookies.get('auth_role')?.value?.toUpperCase();

  // If not logged in, redirect to login page
  if (!token || !role) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Admin section: ADMIN only
  if (pathname.startsWith('/admin')) {
    if (role !== 'ADMIN') {
      return NextResponse.redirect(new URL('/403', request.url));
    }
  }

  // Analyst section: ADMIN or ANALYST
  if (pathname.startsWith('/analyst')) {
    if (role !== 'ADMIN' && role !== 'ANALYST') {
      return NextResponse.redirect(new URL('/403', request.url));
    }
  }

  // Provider section: ADMIN or PROVIDER
  if (pathname.startsWith('/provider')) {
    if (role !== 'ADMIN' && role !== 'PROVIDER') {
      return NextResponse.redirect(new URL('/403', request.url));
    }
  }

  // Subject section: ADMIN, ANALYST, or SUBJECT
  if (pathname.startsWith('/subject')) {
    if (role !== 'ADMIN' && role !== 'ANALYST' && role !== 'SUBJECT') {
      return NextResponse.redirect(new URL('/403', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/analyst/:path*',
    '/provider/:path*',
    '/subject/:path*',
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
