import { NextResponse } from 'next/server';
import { isAuthed } from '@/lib/auth';
import { parseTask, readGateStatus } from '@/lib/asana';

export async function GET(request: Request) {
  if (!(await isAuthed(request))) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const gid = parseTask(new URL(request.url).searchParams.get('gid') || '');
  if (!gid) {
    return NextResponse.json({ ok: false, error: 'no task id' }, { status: 400 });
  }
  const token = process.env.ASANA_TOKEN;
  if (!token) {
    return NextResponse.json({ ok: false, error: 'asana not configured' }, { status: 500 });
  }
  return NextResponse.json(await readGateStatus(gid, token));
}
