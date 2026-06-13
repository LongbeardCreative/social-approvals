'use client';

import { useRef, useState } from 'react';
import { Mockup, type Platform } from './Mockup';
import type { Post } from '@/db/schema';
import s from './review.module.css';

const GAP = 14; // matches .carTrack gap

export function Carousel({
  platform,
  account,
  handle,
  posts,
}: {
  platform: Platform;
  account: string;
  handle: string;
  posts: Post[];
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [i, setI] = useState(0);
  const n = posts.length;

  function currentIndex() {
    const t = trackRef.current;
    if (!t || !t.clientWidth) return 0;
    return Math.max(0, Math.min(n - 1, Math.round(t.scrollLeft / (t.clientWidth + GAP))));
  }
  function go(delta: number) {
    const t = trackRef.current;
    if (!t) return;
    const target = Math.max(0, Math.min(n - 1, i + delta));
    t.scrollTo({ left: target * (t.clientWidth + GAP), behavior: 'smooth' });
  }

  return (
    <div className={s.car}>
      <div className={s.carTrack} ref={trackRef} onScroll={() => setI(currentIndex())}>
        {posts.map((po, k) => (
          <div className={s.carItem} key={k}>
            <Mockup platform={platform} account={account} handle={handle} post={po} />
          </div>
        ))}
      </div>
      <div className={s.carBar}>
        <button
          className={s.carBtn}
          type="button"
          aria-label="Previous post"
          disabled={i === 0}
          onClick={() => go(-1)}
        >
          ‹
        </button>
        <div className={s.carDots}>
          {posts.map((_, k) => (
            <span key={k} className={`${s.dot}${k === i ? ' ' + s.on : ''}`} />
          ))}
        </div>
        <button
          className={s.carBtn}
          type="button"
          aria-label="Next post"
          disabled={i === n - 1}
          onClick={() => go(1)}
        >
          ›
        </button>
        <span className={s.carCount}>
          {i + 1} / {n}
        </span>
      </div>
    </div>
  );
}
