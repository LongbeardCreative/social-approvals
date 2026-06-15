import { describe, it, expect } from 'vitest';
import { routingForScope } from '@/lib/decision-routing';
import { COPY_GATE, CREATIVE_GATE } from '@/lib/asana';

describe('routingForScope', () => {
  it('copy → Jenna assignee, copy gate, copy status, no mention', () => {
    expect(routingForScope('copy')).toEqual({
      assigneeEnv: 'ASSIGNEE_COPY',
      gates: [COPY_GATE],
      statuses: ['copy'],
      mention: false,
    });
  });
  it('images → Johan assignee, creative gate, image status', () => {
    expect(routingForScope('images')).toEqual({
      assigneeEnv: 'ASSIGNEE',
      gates: [CREATIVE_GATE],
      statuses: ['images'],
      mention: false,
    });
  });
  it('everything → Johan, both gates, both statuses, mention Jenna', () => {
    expect(routingForScope('everything')).toEqual({
      assigneeEnv: 'ASSIGNEE',
      gates: [COPY_GATE, CREATIVE_GATE],
      statuses: ['copy', 'images'],
      mention: true,
    });
  });
});
