import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getReviewById } from '@/db/reviews';
import { PLATFORMS, type PlatformId } from '@/components/editor-state';
import { AVATAR } from '@/components/avatar';
import { Mockup } from '@/components/Mockup';
import { Carousel } from '@/components/Carousel';
import { Decision } from '@/components/Decision';
import { reviewIntro } from '@/lib/review-copy';
import s from '@/components/review.module.css';

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const review = await getReviewById(id);
  if (!review) notFound();

  const enabled = PLATFORMS.filter((p) => review.platforms[p.id]?.on);
  if (enabled.length === 0) notFound();

  const total = enabled.reduce((sum, p) => sum + review.platforms[p.id].posts.length, 0);
  const anyMulti = enabled.some((p) => review.platforms[p.id].posts.length > 1);
  const intro = reviewIntro({
    total,
    platformCount: enabled.length,
    firstLabel: enabled[0].label,
    anyMulti,
  });
  const dateStr = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(review.createdAt);

  return (
    <div className={s.page}>
      <div className={s.wrap}>
        <header>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={AVATAR} alt="Magisterium AI logo" />
          <div>
            <h1>{review.campaign}</h1>
            <p>
              Social asset review · {dateStr} · {review.account}
            </p>
          </div>
        </header>

        <p className={s.note}>{intro}</p>

        <main>
          {enabled.map((p) => {
            const ps = review.platforms[p.id];
            return (
              <div className="slot" key={p.id}>
                <div className="slot-tag">
                  {p.label}
                  {ps.posts.length > 1 && <em>{` · ${ps.posts.length} posts`}</em>}
                </div>
                {ps.posts.length === 1 ? (
                  <Mockup
                    platform={p.id as PlatformId}
                    account={review.account}
                    handle={review.handle}
                    post={ps.posts[0]}
                  />
                ) : (
                  <Carousel
                    platform={p.id as PlatformId}
                    account={review.account}
                    handle={review.handle}
                    posts={ps.posts}
                  />
                )}
              </div>
            );
          })}
        </main>

        <section className={s.decide}>
          <h2>Your decision</h2>
          <p className={s.sub}>
            One decision per area. Copy decisions go to Jenna; images to Johan. Posted straight to the
            Asana task.
          </p>
          <Decision
            reviewId={review.id}
            campaign={review.campaign}
            total={total}
            copyStatus={review.copyStatus}
            imageStatus={review.imageStatus}
          />
        </section>

        <footer className={s.footer}>
          Prepared with Longbeard Creative · decisions post to the Asana task automatically
        </footer>
      </div>
    </div>
  );
}
