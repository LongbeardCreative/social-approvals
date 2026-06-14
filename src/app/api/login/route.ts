import { NextResponse } from 'next/server';
import { z } from 'zod';
import { checkPassword, sessionToken, SESSION_COOKIE } from '@/lib/auth';

const Body = z.object({ password: z.string() });

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });

  if (!checkPassword(parsed.data.password)) {
    return NextResponse.json({ ok: false, error: 'Wrong password' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await sessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
