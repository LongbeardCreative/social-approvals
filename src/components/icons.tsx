import type { ReactNode } from 'react';

// Ported from legacy/editor.html ico()/icoFill() (lines 292-313).

export type StrokeIconName =
  | 'heart'
  | 'chat'
  | 'repost'
  | 'shareup'
  | 'plane'
  | 'bookmark'
  | 'thumb'
  | 'globe'
  | 'img';
export type FillIconName = 'thumb' | 'heart' | 'dots';

const STROKE: Record<StrokeIconName, ReactNode> = {
  heart: (
    <path d="M12 21C12 21 4 14.9 4 9.5 4 6.6 6.4 4.2 9.1 4.2c1.4 0 2.4.7 2.9 1.4.5-.7 1.5-1.4 2.9-1.4 2.7 0 5.1 2.4 5.1 5.3C20 14.9 12 21 12 21z" />
  ),
  chat: (
    <path d="M21 11.6a8.4 8.4 0 0 1-8.5 8.3c-1.5 0-2.9-.4-4.1-1L3 20l1.1-5A8.4 8.4 0 1 1 21 11.6z" />
  ),
  repost: (
    <>
      <path d="M17 2l4 4-4 4" />
      <path d="M21 6H8.5A4.5 4.5 0 0 0 4 10.5V12" />
      <path d="M7 22l-4-4 4-4" />
      <path d="M3 18h12.5a4.5 4.5 0 0 0 4.5-4.5V12" />
    </>
  ),
  shareup: (
    <>
      <path d="M12 15V3" />
      <path d="M7.5 7.5 12 3l4.5 4.5" />
      <path d="M4.5 12.5v6a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-6" />
    </>
  ),
  plane: (
    <>
      <path d="M21.5 2.5 11 13" />
      <path d="M21.5 2.5 14.7 21l-3.7-8-8-3.7 18.5-6.8z" />
    </>
  ),
  bookmark: <path d="M18.5 21l-6.5-4.6L5.5 21V5.4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2V21z" />,
  thumb: (
    <>
      <path d="M7.3 10.5 11 3.2a2 2 0 0 1 1.9 2.6L12.2 9h6.3a2 2 0 0 1 2 2.4l-1.5 6.9a2 2 0 0 1-2 1.6H7.3" />
      <path d="M7.3 10.5H4.5a1.5 1.5 0 0 0-1.5 1.5v6.5a1.5 1.5 0 0 0 1.5 1.5h2.8V10.5z" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="8.6" />
      <path d="M3.4 12h17.2" />
      <path d="M12 3.4c2.3 2.3 3.6 5.3 3.6 8.6s-1.3 6.3-3.6 8.6c-2.3-2.3-3.6-5.3-3.6-8.6S9.7 5.7 12 3.4z" />
    </>
  ),
  img: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2.2" />
      <circle cx="8.6" cy="9.7" r="1.5" />
      <path d="M21 15.5 15.8 10 5.5 19" />
    </>
  ),
};

const FILL: Record<FillIconName, ReactNode> = {
  thumb: (
    <path d="M7.3 10.5 11 3.2a2 2 0 0 1 1.9 2.6L12.2 9h6.3a2 2 0 0 1 2 2.4l-1.5 6.9a2 2 0 0 1-2 1.6H7.3zM5.8 10.5H4.5A1.5 1.5 0 0 0 3 12v6.5A1.5 1.5 0 0 0 4.5 20h1.3z" />
  ),
  heart: (
    <path d="M12 20.5C12 20.5 3.5 14.6 3.5 9.3 3.5 6.4 5.9 4 8.6 4c1.5 0 2.8.8 3.4 1.6C12.6 4.8 13.9 4 15.4 4c2.7 0 5.1 2.4 5.1 5.3 0 5.3-8.5 11.2-8.5 11.2z" />
  ),
  dots: (
    <>
      <circle cx="5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="19" cy="12" r="1.6" />
    </>
  ),
};

export function Icon({ name, className }: { name: StrokeIconName; className?: string }) {
  return (
    <svg
      className={'ico' + (className ? ' ' + className : '')}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {STROKE[name]}
    </svg>
  );
}

export function IconFill({ name }: { name: FillIconName }) {
  return (
    <svg className="ico" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      {FILL[name]}
    </svg>
  );
}
