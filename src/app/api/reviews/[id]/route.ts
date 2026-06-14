import { NextResponse } from 'next/server';
import { CreateReviewInput } from '@/lib/review-input';
import { updateReview } from '@/db/reviews';
import { isAuthed } from '@/lib/auth';

export async function PUT(request: Request, ctx: RouteContext<'/api/reviews/[id]'>) {
  if (!(await isAuthed(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { id } = await ctx.params;
  const json = await request.json().catch(() => null);
  const parsed = CreateReviewInput.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid input' }, { status: 400 });
  }

  const updated = await updateReview(id, parsed.data);
  if (!updated) {
    return NextResponse.json({ error: 'review not found' }, { status: 404 });
  }
  return NextResponse.json({ id: updated.id });
}
