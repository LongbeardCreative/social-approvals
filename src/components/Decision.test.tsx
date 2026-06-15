// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Decision } from './Decision';

describe('Decision scope selector', () => {
  it('defaults to Everything and shows an approve-all label', () => {
    render(
      <Decision reviewId="abc" campaign="C" total={4} copyStatus="pending" imageStatus="pending" />,
    );
    expect(screen.getByText('Copy')).toBeTruthy();
    expect(screen.getByText('Images')).toBeTruthy();
    expect(screen.getByText('Everything')).toBeTruthy();
    expect(screen.getByRole('button', { name: /approve all 4/i })).toBeTruthy();
  });
});
