import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getReviewById, markReviewDecided } from '@/db/reviews';
import { postDecisionToAsana } from '@/lib/asana';

const Body = z.object({
  decision: z.enum(['Approved', 'Revisions requested']),
  feedback: z.string().optional().default(''),
});

export async function POST(request: Request, ctx: RouteContext<'/api/reviews/[id]/decision'>) {
  const { id } = await ctx.params;

  // Optional hardening: reject POSTs from other origins.
  if (process.env.ALLOWED_ORIGIN) {
    const origin = request.headers.get('origin') || '';
    if (origin && origin !== process.env.ALLOWED_ORIGIN) {
      return NextResponse.json({ success: false, error: 'origin not allowed' }, { status: 403 });
    }
  }

  const token = process.env.ASANA_TOKEN;
  const assignee = process.env.ASSIGNEE;
  const reviewer = process.env.REVIEWER || 'Matthew';
  if (!token || !assignee) {
    return NextResponse.json({ success: false, error: 'Asana not configured' }, { status: 500 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'invalid JSON' }, { status: 400 });
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'invalid input' }, { status: 400 });
  }

  const review = await getReviewById(id);
  if (!review) {
    return NextResponse.json({ success: false, error: 'review not found' }, { status: 404 });
  }
  if (review.status === 'approved' || review.status === 'revisions') {
    return NextResponse.json({ success: true, alreadyDecided: true });
  }

  const feedback = parsed.data.feedback.trim().slice(0, 8000);
  const url = `${new URL(request.url).origin}/r/${id}`;
  const result = await postDecisionToAsana({
    task: review.asanaTaskGid,
    decision: parsed.data.decision,
    feedback,
    url,
    token,
    assignee,
    reviewer,
  });

  if (!result.ok) {
    return NextResponse.json(
      { success: false, error: `asana comment failed (${result.status})`, detail: result.detail },
      { status: 502 },
    );
  }

  await markReviewDecided(
    id,
    parsed.data.decision === 'Approved' ? 'approved' : 'revisions',
    feedback,
  );
  return NextResponse.json(
    result.warning ? { success: true, warning: result.warning } : { success: true },
  );
}
