/* eslint-disable @next/next/no-img-element */
import type { ReactNode } from 'react';
import { AVATAR } from './avatar';
import { Icon, IconFill } from './icons';
import type { Post } from '@/db/schema';

export type Platform = 'x' | 'ig' | 'fb' | 'li';

/** newlines -> <br>, ported from legacy nl2br. React escapes the text itself. */
function brLines(text: string): ReactNode {
  return text.split('\n').map((line, i) => (
    <span key={i}>
      {i > 0 && <br />}
      {line}
    </span>
  ));
}

/** The .txt block with a muted placeholder fallback (legacy fitText). */
function Copy({ text, muted }: { text: string; muted: string }) {
  const t = (text || '').trim();
  if (!t) return <div className="txt mut">{muted}</div>;
  return <div className="txt">{brLines(t)}</div>;
}

function Photo({ img }: { img: string | null }) {
  if (img)
    return (
      <div className="ph">
        <img src={img} alt="Post image" />
      </div>
    );
  return (
    <div className="ph">
      <div className="ph-empty">
        <Icon name="img" />
        <span>1080 × 1350 image</span>
      </div>
    </div>
  );
}

export function Mockup({
  platform,
  account,
  handle,
  post,
}: {
  platform: Platform;
  account: string;
  handle: string;
  post: Post;
}) {
  if (platform === 'x') {
    return (
      <div className="mk mk-x">
        <div className="row">
          <img className="av" src={AVATAR} alt="" />
          <div className="body">
            <div className="hd">
              <span className="nm">{account}</span>
              <span className="meta">@{handle} · 2h</span>
            </div>
            <Copy text={post.copy} muted="Post copy will appear here…" />
            <Photo img={post.img} />
            <div className="acts">
              <span className="act">
                <Icon name="chat" />18
              </span>
              <span className="act">
                <Icon name="repost" />42
              </span>
              <span className="act">
                <Icon name="heart" />312
              </span>
              <span className="act">
                <Icon name="shareup" />
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (platform === 'ig') {
    const cap = post.copy.trim();
    return (
      <div className="mk mk-ig">
        <div className="hd">
          <img className="av" src={AVATAR} alt="" />
          <span className="un">{handle}</span>
          <span className="dots">
            <IconFill name="dots" />
          </span>
        </div>
        <Photo img={post.img} />
        <div className="acts">
          <Icon name="heart" />
          <Icon name="chat" />
          <Icon name="plane" />
          <span className="sp">
            <Icon name="bookmark" />
          </span>
        </div>
        <div className="likes">1,247 likes</div>
        <div className="cap">
          <span className="un">{handle}</span>
          {cap ? brLines(cap) : <span className="mut">Caption will appear here…</span>}
        </div>
        <div className="time">2 hours ago</div>
      </div>
    );
  }

  if (platform === 'fb') {
    return (
      <div className="mk mk-fb">
        <div className="hd">
          <img className="av" src={AVATAR} alt="" />
          <div>
            <div className="nm">{account}</div>
            <div className="sub">
              Just now · <Icon name="globe" className="sm" />
            </div>
          </div>
          <span className="dots">
            <IconFill name="dots" />
          </span>
        </div>
        <Copy text={post.copy} muted="Post copy will appear here…" />
        <Photo img={post.img} />
        <div className="stats">
          <span className="emoj">
            <span className="em l">
              <IconFill name="thumb" />
            </span>
            <span className="em h">
              <IconFill name="heart" />
            </span>
          </span>
          96<span className="right">11 comments · 7 shares</span>
        </div>
        <div className="bbar">
          <span className="bt">
            <Icon name="thumb" />
            Like
          </span>
          <span className="bt">
            <Icon name="chat" />
            Comment
          </span>
          <span className="bt">
            <Icon name="shareup" />
            Share
          </span>
        </div>
      </div>
    );
  }

  // linkedin
  return (
    <div className="mk mk-li">
      <div className="hd">
        <img className="av" src={AVATAR} alt="" />
        <div>
          <div className="nm">{account}</div>
          <div className="sub">12,406 followers</div>
          <div className="sub">
            <span className="in">
              2h · <Icon name="globe" className="sm" />
            </span>
          </div>
        </div>
        <span className="dots">
          <IconFill name="dots" />
        </span>
      </div>
      <Copy text={post.copy} muted="Post copy will appear here…" />
      <Photo img={post.img} />
      <div className="stats">
        <span className="emoj">
          <span className="em l">
            <IconFill name="thumb" />
          </span>
          <span className="em h">
            <IconFill name="heart" />
          </span>
        </span>
        88<span className="right">14 comments · 6 reposts</span>
      </div>
      <div className="bbar">
        <span className="bt">
          <Icon name="thumb" />
          Like
        </span>
        <span className="bt">
          <Icon name="chat" />
          Comment
        </span>
        <span className="bt">
          <Icon name="repost" />
          Repost
        </span>
        <span className="bt">
          <Icon name="plane" />
          Send
        </span>
      </div>
    </div>
  );
}
