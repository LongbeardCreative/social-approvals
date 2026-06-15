import { COPY_GATE, CREATIVE_GATE } from '@/lib/asana';
import type { DecisionScope } from '@/db/schema';

export const SCOPE_LABEL: Record<DecisionScope, string> = {
  copy: 'Copy',
  images: 'Images',
  everything: 'Copy + images',
};

export type Routing = {
  assigneeEnv: 'ASSIGNEE' | 'ASSIGNEE_COPY';
  gates: string[];
  statuses: ('copy' | 'images')[];
  mention: boolean;
};

export function routingForScope(scope: DecisionScope): Routing {
  switch (scope) {
    case 'copy':
      return { assigneeEnv: 'ASSIGNEE_COPY', gates: [COPY_GATE], statuses: ['copy'], mention: false };
    case 'images':
      return { assigneeEnv: 'ASSIGNEE', gates: [CREATIVE_GATE], statuses: ['images'], mention: false };
    case 'everything':
      return {
        assigneeEnv: 'ASSIGNEE',
        gates: [COPY_GATE, CREATIVE_GATE],
        statuses: ['copy', 'images'],
        mention: true,
      };
  }
}
