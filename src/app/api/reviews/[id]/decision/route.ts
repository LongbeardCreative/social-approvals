import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getReviewById, markScopeDecided } from '@/db/reviews';
import { postDecisionToAsana } from '@/lib/asana';
import { routingForScope } from '@/lib/decision-routing';

const Body = z.object({
  scope: z.enum(['copy', 'images', 'everything']).default('everything'),
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
  const reviewer = process.env.REVIEWER || 'Matthew';
  if (!token) {
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
  const { scope, decision } = parsed.data;

  const review = await getReviewById(id);
  if (!review) {
    return NextResponse.json({ success: false, error: 'review not found' }, { status: 404 });
  }

  const decided = (s: string) => s !== 'pending';
  const already =
    scope === 'copy'
      ? decided(review.copyStatus)
      : scope === 'images'
        ? decided(review.imageStatus)
        : decided(review.copyStatus) && decided(review.imageStatus);
  if (already) {
    return NextResponse.json({ success: true, alreadyDecided: true });
  }

  const routing = routingForScope(scope);
  const assignee = process.env[routing.assigneeEnv];
  if (!assignee) {
    return NextResponse.json({ success: false, error: 'assignee not configured' }, { status: 500 });
  }

  const feedback = parsed.data.feedback.trim().slice(0, 8000);
  const url = `${new URL(request.url).origin}/r/${id}`;
  const result = await postDecisionToAsana({
    task: review.asanaTaskGid,
    scope,
    decision,
    feedback,
    url,
    token,
    assignee,
    reviewer,
    gates: routing.gates,
    mentionGid: routing.mention ? process.env.COPY_REVIEWER_GID : undefined,
  });

  if (!result.ok) {
    return NextResponse.json(
      { success: false, error: `asana comment failed (${result.status})`, detail: result.detail },
      { status: 502 },
    );
  }

  await markScopeDecided(id, scope, decision, feedback);
  return NextResponse.json(
    result.warning ? { success: true, warning: result.warning } : { success: true },
  );
}
