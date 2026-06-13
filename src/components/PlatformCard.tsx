'use client';

import { useState, type ChangeEvent, type Dispatch } from 'react';
import type { PlatformState } from '@/db/schema';
import { Mockup } from './Mockup';
import { uploadImage } from '@/lib/upload';
import { MAX_POSTS, type Action, type PlatformId } from './editor-state';
import s from './editor.module.css';

function noteLabel(note: string): { text: string; cls: string } | null {
  if (note === 'ok') return { text: '✓ 1080 × 1350', cls: s.ok };
  if (note === 'cropped') return { text: 'Cropped to 4:5', cls: s.warn };
  if (note === 'upscaled') return { text: 'Upscaled — final should be 1080 × 1350', cls: s.warn };
  return null;
}

export function PlatformCard({
  id,
  label,
  pstate,
  account,
  handle,
  dispatch,
}: {
  id: PlatformId;
  label: string;
  pstate: PlatformState;
  account: string;
  handle: string;
  dispatch: Dispatch<Action>;
}) {
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const cur = pstate.posts[pstate.cur];
  const note = noteLabel(cur.note);

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setErr(null);
    setUploading(true);
    try {
      const { publicUrl, assessment } = await uploadImage(file);
      dispatch({ type: 'setImage', id, img: publicUrl, note: assessment });
    } catch (ex) {
      setErr((ex as Error).message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className={`${s.card}${pstate.on ? '' : ' ' + s.off}`}>
      <div className={s.cardHead}>
        <span className={s.name}>{label}</span>
        <label className={s.toggle}>
          {pstate.on ? 'On' : 'Off'}
          <input
            type="checkbox"
            checked={pstate.on}
            onChange={() => dispatch({ type: 'toggle', id })}
          />
        </label>
      </div>

      <div className={s.tabs}>
        {pstate.posts.map((_, i) => (
          <button
            key={i}
            type="button"
            className={`${s.pill}${i === pstate.cur ? ' ' + s.active : ''}`}
            onClick={() => dispatch({ type: 'selectPost', id, index: i })}
            disabled={!pstate.on}
          >
            {i + 1}
          </button>
        ))}
        <button
          type="button"
          className={s.miniBtn}
          title="Add a post"
          onClick={() => dispatch({ type: 'addPost', id })}
          disabled={!pstate.on || pstate.posts.length >= MAX_POSTS}
        >
          +
        </button>
        <button
          type="button"
          className={s.miniBtn}
          title="Remove this post"
          onClick={() => dispatch({ type: 'removePost', id })}
          disabled={!pstate.on || pstate.posts.length <= 1}
        >
          −
        </button>
        <span className={s.eyebrow}>
          post {pstate.cur + 1} of {pstate.posts.length}
        </span>
      </div>

      <textarea
        className={s.textarea}
        value={cur.copy}
        disabled={!pstate.on}
        placeholder="Write the post copy…"
        onChange={(e) => dispatch({ type: 'setCopy', id, value: e.target.value })}
      />

      <div className={s.imgrow}>
        <label className={s.miniBtn}>
          {uploading ? 'Uploading…' : cur.img ? 'Replace image' : 'Add image'}
          <input
            type="file"
            accept="image/*"
            onChange={onFile}
            disabled={!pstate.on || uploading}
            hidden
          />
        </label>
        {cur.img && (
          <button
            type="button"
            className={s.miniBtn}
            onClick={() => dispatch({ type: 'setImage', id, img: null, note: '' })}
            disabled={!pstate.on}
          >
            Remove
          </button>
        )}
        {note && <span className={`${s.note} ${note.cls}`}>{note.text}</span>}
        {err && <span className={`${s.note} ${s.warn}`}>{err}</span>}
      </div>

      <div className={s.spread}>
        <button
          type="button"
          className={s.linkBtn}
          disabled={!pstate.on}
          onClick={() => dispatch({ type: 'copyToAll', from: id })}
        >
          copy → all
        </button>
        <button
          type="button"
          className={s.linkBtn}
          disabled={!pstate.on || !cur.img}
          onClick={() => dispatch({ type: 'imageToAll', from: id })}
        >
          image → all
        </button>
      </div>

      <div className={s.previewLabel}>Live preview</div>
      <Mockup platform={id} account={account} handle={handle} post={cur} />
    </div>
  );
}
