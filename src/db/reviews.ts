import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDb } from './index';
import { reviews, type NewReview, type Review } from './schema';

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
