import { NextResponse } from 'next/server';
import { CreateReviewInput } from '@/lib/review-input';
import { createReview } from '@/db/reviews';

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const parsed = CreateReviewInput.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid input', issues: parsed.error.issues }, { status: 400 });
  }

  const review = await createReview({
    campaign: parsed.data.campaign,
    account: parsed.data.account,
    handle: parsed.data.handle,
    asanaTaskGid: parsed.data.asanaTaskGid,
    platforms: parsed.data.platforms,
    // status defaults to 'pending'
  });

  return NextResponse.json({ id: review.id });
}
