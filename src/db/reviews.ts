import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDb } from './index';
import { reviews, type NewReview, type Review, type ReviewStatus, type DecisionScope } from './schema';
import { rollupStatus, nextStatuses } from '@/lib/review-status';
import type { Decision } from '@/lib/asana';

/** Unguessable-enough public slug for /r/{id}. */
export function newReviewId(): string {
  return nanoid(12);
}

export async function createReview(
  data: Omit<NewReview, 'id'> & { id?: string },
): Promise<Review> {
  const id = data.id ?? newReviewId();
  const [row] = await getDb()
    .insert(reviews)
    .values({ ...data, id })
    .returning();
  return row;
}

export async function getReviewById(id: string): Promise<Review | null> {
  const [row] = await getDb().select().from(reviews).where(eq(reviews.id, id)).limit(1);
  return row ?? null;
}

/** Record a reviewer's decision on the row (status + notes + timestamp). */
export async function markReviewDecided(
  id: string,
  status: Extract<ReviewStatus, 'approved' | 'revisions'>,
  decisionNotes: string,
): Promise<void> {
  await getDb()
    .update(reviews)
    .set({ status, decisionNotes, decidedAt: new Date() })
    .where(eq(reviews.id, id));
}

/** Record a scoped decision: set the per-scope fields, recompute the overall roll-up. */
export async function markScopeDecided(
  id: string,
  scope: DecisionScope,
  decision: Decision,
  notes: string,
): Promise<void> {
  const review = await getReviewById(id);
  if (!review) return;
  const next = nextStatuses(
    { copyStatus: review.copyStatus, imageStatus: review.imageStatus },
    scope,
    decision,
  );
  const now = new Date();
  const touchesCopy = scope !== 'images';
  const touchesImages = scope !== 'copy';
  await getDb()
    .update(reviews)
    .set({
      copyStatus: next.copyStatus,
      imageStatus: next.imageStatus,
      ...(touchesCopy ? { copyNotes: notes, copyDecidedAt: now } : {}),
      ...(touchesImages ? { imageNotes: notes, imageDecidedAt: now } : {}),
      status: rollupStatus(next.copyStatus, next.imageStatus),
      decisionNotes: notes,
      decidedAt: now,
    })
    .where(eq(reviews.id, id));
}

/** Overwrite a review's content and reset it to pending (a new revision round). */
export async function updateReview(
  id: string,
  data: Omit<NewReview, 'id'>,
): Promise<Review | null> {
  const [row] = await getDb()
    .update(reviews)
    .set({
      campaign: data.campaign,
      account: data.account,
      handle: data.handle,
      asanaTaskGid: data.asanaTaskGid,
      platforms: data.platforms,
      status: 'pending',
      decisionNotes: null,
      decidedAt: null,
      copyStatus: 'pending',
      imageStatus: 'pending',
      copyNotes: null,
      imageNotes: null,
      copyDecidedAt: null,
      imageDecidedAt: null,
    })
    .where(eq(reviews.id, id))
    .returning();
  return row ?? null;
}
