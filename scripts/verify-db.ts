import { config } from 'dotenv';
config({ path: '.env.local' });

import { eq } from 'drizzle-orm';
import { createReview, getReviewById } from '../src/db/reviews';
import { getDb } from '../src/db/index';
import { reviews } from '../src/db/schema';

async function main() {
  const platforms = {
    x: { on: true, cur: 0, posts: [{ copy: 'hello', img: null, note: '' }] },
  };

  const created = await createReview({
    campaign: 'DB verify',
    account: 'Magisterium AI',
    handle: 'magisteriumai',
    asanaTaskGid: '1209888777666555',
    platforms,
  });
  console.log('1/3 inserted:', created.id, '| status:', created.status, '| createdAt:', created.createdAt);
  if (created.status !== 'pending') throw new Error('default status should be pending');

  const got = await getReviewById(created.id);
  if (!got || got.campaign !== 'DB verify' || got.platforms.x.posts[0].copy !== 'hello') {
    throw new Error('read-back mismatch');
  }
  console.log('2/3 read back OK');

  await getDb().delete(reviews).where(eq(reviews.id, created.id));
  const gone = await getReviewById(created.id);
  if (gone) throw new Error('row not deleted');
  console.log('3/3 deleted OK\n\n✅ DB round-trip verified');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('❌', e);
    process.exit(1);
  });
