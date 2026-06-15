// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBadge } from './AsanaStatus';

describe('StatusBadge', () => {
  it('shows a loading hint', () => {
    render(<StatusBadge state="loading" />);
    expect(screen.getByText(/checking asana/i)).toBeTruthy();
  });

  it('shows unavailable', () => {
    render(<StatusBadge state="unavailable" />);
    expect(screen.getByText(/status unavailable/i)).toBeTruthy();
  });

  it('shows copy approved + images pending', () => {
    render(<StatusBadge state={{ copy: 'approved', images: 'pending' }} />);
    expect(screen.getByText('Copy approved')).toBeTruthy();
    expect(screen.getByText('Images pending')).toBeTruthy();
  });
});
