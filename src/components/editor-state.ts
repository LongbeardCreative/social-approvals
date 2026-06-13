import type { Platforms, PlatformState, Post } from '@/db/schema';

export type PlatformId = 'x' | 'ig' | 'fb' | 'li';

export const PLATFORMS: { id: PlatformId; label: string }[] = [
  { id: 'x', label: 'X' },
  { id: 'ig', label: 'Instagram' },
  { id: 'fb', label: 'Facebook' },
  { id: 'li', label: 'LinkedIn' },
];

export const MAX_POSTS = 6;

export type EditorState = {
  campaign: string;
  account: string;
  handle: string;
  asanaTask: string; // raw input; gid parsed at submit
  platforms: Platforms;
};

export function newPost(): Post {
  return { copy: '', img: null, note: '' };
}

export function initialState(): EditorState {
  const platforms: Platforms = {};
  for (const { id } of PLATFORMS) platforms[id] = { on: true, cur: 0, posts: [newPost()] };
  return { campaign: '', account: 'Magisterium AI', handle: 'magisteriumai', asanaTask: '', platforms };
}

export type Action =
  | { type: 'field'; key: 'campaign' | 'account' | 'handle' | 'asanaTask'; value: string }
  | { type: 'toggle'; id: PlatformId }
  | { type: 'addPost'; id: PlatformId }
  | { type: 'removePost'; id: PlatformId }
  | { type: 'selectPost'; id: PlatformId; index: number }
  | { type: 'setCopy'; id: PlatformId; value: string }
  | { type: 'setImage'; id: PlatformId; img: string | null; note: string }
  | { type: 'copyToAll'; from: PlatformId }
  | { type: 'imageToAll'; from: PlatformId }
  | { type: 'reset' };

function withPlatform(
  s: EditorState,
  id: PlatformId,
  fn: (p: PlatformState) => PlatformState,
): EditorState {
  return { ...s, platforms: { ...s.platforms, [id]: fn(s.platforms[id]) } };
}

/** Apply a patch to the *current* post of every platform. */
function applyToAllCurrent(s: EditorState, patch: Partial<Post>): EditorState {
  const platforms: Platforms = {};
  for (const id of Object.keys(s.platforms) as PlatformId[]) {
    const p = s.platforms[id];
    platforms[id] = {
      ...p,
      posts: p.posts.map((post, i) => (i === p.cur ? { ...post, ...patch } : post)),
    };
  }
  return { ...s, platforms };
}

export function reducer(s: EditorState, a: Action): EditorState {
  switch (a.type) {
    case 'field':
      return { ...s, [a.key]: a.value };
    case 'toggle':
      return withPlatform(s, a.id, (p) => ({ ...p, on: !p.on }));
    case 'addPost':
      return withPlatform(s, a.id, (p) =>
        p.posts.length >= MAX_POSTS
          ? p
          : { ...p, posts: [...p.posts, newPost()], cur: p.posts.length },
      );
    case 'removePost':
      return withPlatform(s, a.id, (p) => {
        if (p.posts.length <= 1) return p;
        const posts = p.posts.filter((_, i) => i !== p.cur);
        return { ...p, posts, cur: Math.min(p.cur, posts.length - 1) };
      });
    case 'selectPost':
      return withPlatform(s, a.id, (p) =>
        a.index >= 0 && a.index < p.posts.length ? { ...p, cur: a.index } : p,
      );
    case 'setCopy':
      return withPlatform(s, a.id, (p) => ({
        ...p,
        posts: p.posts.map((post, i) => (i === p.cur ? { ...post, copy: a.value } : post)),
      }));
    case 'setImage':
      return withPlatform(s, a.id, (p) => ({
        ...p,
        posts: p.posts.map((post, i) =>
          i === p.cur ? { ...post, img: a.img, note: a.note } : post,
        ),
      }));
    case 'copyToAll': {
      const src = s.platforms[a.from];
      return applyToAllCurrent(s, { copy: src.posts[src.cur].copy });
    }
    case 'imageToAll': {
      const src = s.platforms[a.from];
      const cur = src.posts[src.cur];
      return applyToAllCurrent(s, { img: cur.img, note: cur.note });
    }
    case 'reset':
      return initialState();
    default:
      return s;
  }
}
