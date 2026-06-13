// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Mockup } from './Mockup';

const post = { copy: 'Line one\nLine two', img: null, note: '' };

describe('Mockup', () => {
  it('renders the account name and copy for X', () => {
    render(<Mockup platform="x" account="Magisterium AI" handle="magisteriumai" post={post} />);
    expect(screen.getByText('Magisterium AI')).toBeTruthy();
    expect(screen.getByText('Line one')).toBeTruthy();
    expect(screen.getByText('Line two')).toBeTruthy();
  });

  it('shows the empty-image placeholder when img is null', () => {
    const { container } = render(
      <Mockup platform="ig" account="A" handle="h" post={{ copy: '', img: null, note: '' }} />,
    );
    expect(container.querySelector('.ph-empty')).toBeTruthy();
    // empty caption falls back to the muted hint
    expect(screen.getByText('Caption will appear here…')).toBeTruthy();
  });

  it('renders an <img> when a URL is provided (fb)', () => {
    const { container } = render(
      <Mockup
        platform="fb"
        account="A"
        handle="h"
        post={{ copy: 'hi', img: 'https://example.com/x.jpg', note: '' }}
      />,
    );
    const img = container.querySelector('.ph img') as HTMLImageElement | null;
    expect(img?.getAttribute('src')).toBe('https://example.com/x.jpg');
  });
});
