import { notFound } from 'next/navigation';
import { getReviewById } from '@/db/reviews';
import { Editor } from '@/components/Editor';
import { PLATFORMS, newPost, type EditorState } from '@/components/editor-state';
import type { Platforms } from '@/db/schema';

export default async function EditReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const review = await getReviewById(id);
  if (!review) notFound();

  // Ensure every platform is present so the editor renders all four cards;
  // platforms missing from the saved review default to off + one empty post.
  const platforms: Platforms = {};
  for (const { id: pid } of PLATFORMS) {
    platforms[pid] = review.platforms[pid] ?? { on: false, cur: 0, posts: [newPost()] };
  }

  const initial: EditorState = {
    campaign: review.campaign,
    account: review.account,
    handle: review.handle,
    asanaTask: review.asanaTaskGid,
    platforms,
  };

  return <Editor initial={initial} reviewId={review.id} />;
}
