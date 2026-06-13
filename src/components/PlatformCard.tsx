'use client';

import { useState, type DragEvent, type ChangeEvent, type Dispatch } from 'react';
import type { PlatformState } from '@/db/schema';
import { Mockup } from './Mockup';
import { Icon } from './icons';
import { uploadImage } from '@/lib/upload';
import { MAX_POSTS, type Action, type PlatformId } from './editor-state';
import s from './editor.module.css';

function Note({ note }: { note: string }) {
  if (note === 'ok') return <span className={s.ok}>1080 × 1350 ✓</span>;
  if (note === 'cropped') return <>Cropped to 4:5</>;
  if (note === 'upscaled') return <>Upscaled — final should be 1080 × 1350</>;
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
  const [drag, setDrag] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const cur = pstate.posts[pstate.cur];

  async function handleFile(file: File | undefined) {
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

  function onInput(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    void handleFile(file);
  }
  function onDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDrag(false);
    void handleFile(e.dataTransfer.files?.[0]);
  }

  const dzStrong = uploading ? 'Uploading…' : cur.img ? 'Replace image' : 'Add image';

  return (
    <section className={`${s.card}${pstate.on ? '' : ' ' + s.off}`}>
      <div className={s.head}>
        <span className={s.plat}>{label}</span>
        <label className={s.sw} title={`Include ${label} in this review`}>
          <input
            type="checkbox"
            checked={pstate.on}
            aria-label={`Include ${label} in the review`}
            onChange={() => dispatch({ type: 'toggle', id })}
          />
          <i />
        </label>
        <span className={s.apply}>
          <button
            type="button"
            className={s.mini}
            title="Use this post's copy on every platform's current post"
            onClick={() => dispatch({ type: 'copyToAll', from: id })}
          >
            copy → all
          </button>
          <button
            type="button"
            className={s.mini}
            title="Use this post's image on every platform's current post"
            onClick={() => dispatch({ type: 'imageToAll', from: id })}
          >
            image → all
          </button>
        </span>
      </div>

      <div className={s.tabs} role="tablist" aria-label={`Posts for ${label}`}>
        {pstate.posts.map((_, i) => (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={i === pstate.cur}
            className={`${s.tab}${i === pstate.cur ? ' ' + s.on : ''}`}
            onClick={() => dispatch({ type: 'selectPost', id, index: i })}
          >
            {i + 1}
          </button>
        ))}
        {pstate.posts.length < MAX_POSTS && (
          <button
            type="button"
            className={s.tab}
            title="Add another post"
            aria-label="Add another post"
            onClick={() => dispatch({ type: 'addPost', id })}
          >
            +
          </button>
        )}
        {pstate.posts.length > 1 && (
          <button
            type="button"
            className={`${s.linkbtn} ${s.rm}`}
            onClick={() => dispatch({ type: 'removePost', id })}
          >
            remove post {pstate.cur + 1}
          </button>
        )}
      </div>

      <div className={s.ctrl}>
        <textarea
          className={s.textarea}
          value={cur.copy}
          placeholder={`Post copy for ${label}…`}
          aria-label={`Post copy for ${label}`}
          onChange={(e) => dispatch({ type: 'setCopy', id, value: e.target.value })}
        />
        {id === 'x' && (
          <div className={`${s.count}${cur.copy.length > 280 ? ' ' + s.over : ''}`}>
            {cur.copy.length} / 280
          </div>
        )}

        <label
          className={`${s.dz}${drag ? ' ' + s.drag : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
        >
          <input type="file" accept="image/*" hidden onChange={onInput} />
          <Icon name="img" />
          <span className={s.dzText}>
            <strong>{dzStrong}</strong>
            <em>drag &amp; drop or click · 1080 × 1350</em>
          </span>
        </label>

        <div className={`${s.imgrow}${cur.img ? ' ' + s.show : ''}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {cur.img && <img src={cur.img} alt="" />}
          <span className={s.note}>
            {err ? err : <Note note={cur.note} />}
          </span>
          <button
            type="button"
            className={s.linkbtn}
            onClick={() => dispatch({ type: 'setImage', id, img: null, note: '' })}
          >
            Remove
          </button>
        </div>
      </div>

      <div className={s.pvzone}>
        <p className={s.eyebrow}>
          {pstate.posts.length > 1
            ? `Live preview · post ${pstate.cur + 1} of ${pstate.posts.length}`
            : 'Live preview'}
        </p>
        <Mockup platform={id} account={account} handle={handle} post={cur} />
      </div>
    </section>
  );
}
