import { NextResponse, type NextRequest } from 'next/server';
import { isAuthed } from '@/lib/auth';

// Next 16 renamed Middleware to Proxy. This is an *optimistic* gate that
// redirects un-logged-in visitors away from the editor pages; the real
// enforcement lives in the editor's API routes (isAuthed → 401).
export async function proxy(request: NextRequest) {
  if (await isAuthed(request)) return NextResponse.next();
  const url = new URL('/login', request.url);
  url.searchParams.set('next', request.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/', '/edit/:path*'],
};
