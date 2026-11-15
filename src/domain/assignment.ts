import type { AssetStatus, EndReason } from './enums';

/**
 * Pure rules that keep an asset's status and holder consistent.
 *
 *  - in_use                 requires a holder
 *  - in_stock               never has a holder (changing to it returns the asset)
 *  - retired / lost         never have a holder (changing to them closes the assignment)
 *  - under_repair/reserved  may keep or drop the holder
 */
export type AssignmentAction =
  | { type: 'none' }
  | { type: 'assign'; personId: string }
  | { type: 'transfer'; personId: string }
  | { type: 'return'; reason: EndReason };

export interface PlanInput {
  currentAssigneeId: string | null;
  nextStatus: AssetStatus;
  nextAssigneeId: string | null;
}

export type StatePlan =
  | { ok: true; assigneeId: string | null; action: AssignmentAction }
  | { ok: false; error: 'in_use_requires_assignee' | 'status_conflicts_with_assignee' };

function holderChange(current: string | null, next: string | null, returnReason: EndReason): AssignmentAction {
  if (next === current) return { type: 'none' };
  if (next === null) return { type: 'return', reason: returnReason };
  return current === null ? { type: 'assign', personId: next } : { type: 'transfer', personId: next };
}

export function planAssetState({ currentAssigneeId, nextStatus, nextAssigneeId }: PlanInput): StatePlan {
  switch (nextStatus) {
    case 'retired':
    case 'lost':
    case 'in_stock': {
      // Asking for a *different* holder is contradictory; keeping the current one is
      // interpreted as "no holder any more".
      if (nextAssigneeId !== null && nextAssigneeId !== currentAssigneeId) {
        return { ok: false, error: 'status_conflicts_with_assignee' };
      }
      const reason: EndReason =
        nextStatus === 'retired' ? 'asset_retired' : nextStatus === 'lost' ? 'asset_lost' : 'returned_to_stock';
      return {
        ok: true,
        assigneeId: null,
        action: currentAssigneeId ? { type: 'return', reason } : { type: 'none' },
      };
    }
    case 'in_use':
      if (nextAssigneeId === null) return { ok: false, error: 'in_use_requires_assignee' };
      return { ok: true, assigneeId: nextAssigneeId, action: holderChange(currentAssigneeId, nextAssigneeId, 'returned_to_stock') };
    case 'under_repair':
    case 'reserved':
      return { ok: true, assigneeId: nextAssigneeId, action: holderChange(currentAssigneeId, nextAssigneeId, 'returned_to_stock') };
  }
}
