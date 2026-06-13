import { describe, it, expect } from 'vitest';
import { reducer, initialState, MAX_POSTS } from '@/components/editor-state';

describe('editor reducer', () => {
  it('field updates a top-level field', () => {
    expect(reducer(initialState(), { type: 'field', key: 'campaign', value: 'Pentecost' }).campaign).toBe(
      'Pentecost',
    );
  });

  it('toggle flips a platform on/off', () => {
    expect(reducer(initialState(), { type: 'toggle', id: 'fb' }).platforms.fb.on).toBe(false);
  });

  it('addPost appends + selects the new one, capped at MAX_POSTS', () => {
    let s = initialState();
    for (let i = 0; i < 10; i++) s = reducer(s, { type: 'addPost', id: 'x' });
    expect(s.platforms.x.posts.length).toBe(MAX_POSTS);
    expect(s.platforms.x.cur).toBe(MAX_POSTS - 1);
  });

  it('removePost keeps >=1 and clamps cur; removing the last is a no-op', () => {
    let s = reducer(initialState(), { type: 'addPost', id: 'x' }); // 2 posts, cur=1
    s = reducer(s, { type: 'removePost', id: 'x' });
    expect(s.platforms.x.posts.length).toBe(1);
    expect(s.platforms.x.cur).toBe(0);
    s = reducer(s, { type: 'removePost', id: 'x' });
    expect(s.platforms.x.posts.length).toBe(1);
  });

  it('setCopy edits only the current post', () => {
    let s = reducer(initialState(), { type: 'addPost', id: 'x' }); // cur=1
    s = reducer(s, { type: 'setCopy', id: 'x', value: 'second' });
    expect(s.platforms.x.posts[1].copy).toBe('second');
    expect(s.platforms.x.posts[0].copy).toBe('');
  });

  it('copyToAll propagates the source current copy to every platform current post', () => {
    let s = reducer(initialState(), { type: 'setCopy', id: 'x', value: 'shared' });
    s = reducer(s, { type: 'copyToAll', from: 'x' });
    expect(s.platforms.ig.posts[s.platforms.ig.cur].copy).toBe('shared');
    expect(s.platforms.fb.posts[s.platforms.fb.cur].copy).toBe('shared');
    expect(s.platforms.li.posts[s.platforms.li.cur].copy).toBe('shared');
  });

  it('imageToAll propagates img + note', () => {
    let s = reducer(initialState(), { type: 'setImage', id: 'ig', img: 'https://x/y.jpg', note: 'ok' });
    s = reducer(s, { type: 'imageToAll', from: 'ig' });
    expect(s.platforms.x.posts[s.platforms.x.cur].img).toBe('https://x/y.jpg');
    expect(s.platforms.fb.posts[s.platforms.fb.cur].note).toBe('ok');
  });
});
