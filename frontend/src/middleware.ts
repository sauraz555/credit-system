/**
 * Next.js Edge Routing & Role-Based Access Control (RBAC) Middleware.
 *
 * Intercepts incoming web requests to enforce session authentication and role-based
 * route segregation before page hydration. Unauthenticated requests are directed to
 * the login portal with redirect context, while unauthorized cross-role navigations
 * are routed to the 403 Forbidden page.
 *
 * Architecture:
 *   Frontend Presentation Layer (Edge Routing & Session Guard).
 *   Executes on the Edge runtime before SSR page components are invoked.
 *   Reads session cookies ('auth_token', 'auth_role') set during authentication.
 *
 * Legal / Regulatory:
 *   Privacy Act 1988 Part IIIA Section 20R: Prevents unauthorized consumer data exposure
 *   by strictly isolating Subject, Provider, Analyst, and Administrator portal routes.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Next.js Edge Middleware function inspecting session cookies and enforcing RBAC policies.
 *
 * @param request - The incoming NextRequest containing path information and session cookies.
 * @returns NextResponse.next() if authorized, or NextResponse.redirect() for login or 403.
 *
 * // REVIEW-SECURITY: Edge middleware validates cookie presence and role matching; the backend API
 * // performs full cryptographic JWT signature validation and expiration checks independently.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Optional site lockdown via Basic Auth if SITE_PASSWORD is set
  const sitePassword = process.env.SITE_PASSWORD;
  if (sitePassword && !pathname.startsWith('/_next') && pathname !== '/favicon.ico') {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Basic ')) {
      return new NextResponse('Authentication Required', {
        status: 401,
        headers: { 'WWW-Authenticate': 'Basic realm="Credit Reporting Mechanism Secure Gateway"' }
      });
    }
    try {
      const base64Credentials = authHeader.split(' ')[1];
      const credentials = atob(base64Credentials);
      const [, pass] = credentials.split(':');
      if (pass !== sitePassword) {
        return new NextResponse('Invalid Credentials', {
          status: 401,
          headers: { 'WWW-Authenticate': 'Basic realm="Credit Reporting Mechanism Secure Gateway"' }
        });
      }
    } catch {
      return new NextResponse('Invalid Authorization Header', { status: 400 });
    }
  }

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

  // REVIEW-SECURITY: Cookies 'auth_token' and 'auth_role' read from incoming client headers
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
