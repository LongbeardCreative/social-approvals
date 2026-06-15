import type { ScopeStatus, ReviewStatus, DecisionScope } from '@/db/schema';
import type { Decision } from '@/lib/asana';

export function rollupStatus(copy: ScopeStatus, images: ScopeStatus): ReviewStatus {
  if (copy === 'revisions' || images === 'revisions') return 'revisions';
  if (copy === 'approved' && images === 'approved') return 'approved';
  return 'pending';
}

export function nextStatuses(
  current: { copyStatus: ScopeStatus; imageStatus: ScopeStatus },
  scope: DecisionScope,
  decision: Decision,
): { copyStatus: ScopeStatus; imageStatus: ScopeStatus } {
  const v: ScopeStatus = decision === 'Approved' ? 'approved' : 'revisions';
  return {
    copyStatus: scope === 'images' ? current.copyStatus : v,
    imageStatus: scope === 'copy' ? current.imageStatus : v,
  };
}
