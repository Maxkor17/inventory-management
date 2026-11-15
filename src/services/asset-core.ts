import type { Tx } from '@/data/store';
import { planAssetState } from '@/domain/assignment';
import type { AssignmentAction } from '@/domain/assignment';
import { diffFields } from '@/domain/activity-diff';
import type { EndReason } from '@/domain/enums';
import type { Asset, AssetInput, Assignment, Location, Person, Result } from '@/domain/types';
import { fail, ok } from '@/domain/types';
import type { Ctx } from './context';
import { assetLabel, logEvent, personLabel } from './context';

/** Fields whose changes are summarised in a single `asset.updated` event. */
export const TRACKED_FIELDS = [
  'inventoryNumber', 'name', 'manufacturer', 'model', 'serialNumber', 'category', 'supplier', 'cost',
  'purchaseDate', 'commissionedDate', 'warrantyEndDate', 'description', 'notes',
] as const satisfies readonly (keyof Asset)[];

export type AssetPatch = Partial<AssetInput>;

export interface AssetRefs {
  people: readonly Person[];
  locations: readonly Location[];
}

export interface CommitOptions {
  note?: string;
  /** Overrides the reason stored on a closed assignment (e.g. `offboarding`). */
  endReason?: EndReason;
}

async function activeAssignments(tx: Tx, assetId: string): Promise<Assignment[]> {
  const all = await tx.assignments.getAll();
  return all.filter((a) => a.assetId === assetId && a.returnedAt === null);
}

async function applyAction(
  ctx: Ctx, tx: Tx, asset: Asset, action: AssignmentAction, note: string, endReasonOverride?: EndReason,
): Promise<EndReason | 'assigned' | null> {
  if (action.type === 'none') return null;
  const now = ctx.now();
  const stale = await activeAssignments(tx, asset.id);

  let closeReason: EndReason = action.type === 'return' ? action.reason : 'transferred';
  if (endReasonOverride) closeReason = endReasonOverride;
  for (const a of stale) await tx.assignments.put({ ...a, returnedAt: now, endReason: closeReason });

  if (action.type === 'assign' || action.type === 'transfer') {
    await tx.assignments.put({
      id: ctx.id(), assetId: asset.id, personId: action.personId, assignedAt: now,
      returnedAt: null, endReason: null, note, isDemo: asset.isDemo,
    });
  }
  return action.type === 'assign' ? 'assigned' : closeReason;
}

/**
 * The single place where an asset changes. Plans the status/holder rules, persists the asset,
 * maintains the assignment ledger and writes the audit events — all in the caller's transaction.
 * Returns the unchanged asset (and writes nothing) when the patch changes nothing.
 */
export async function commitAssetChange(
  ctx: Ctx, tx: Tx, before: Asset, patch: AssetPatch, refs: AssetRefs, opts: CommitOptions = {},
): Promise<Result<Asset>> {
  const nextStatus = patch.status ?? before.status;
  const requestedAssignee = patch.assigneeId !== undefined ? patch.assigneeId : before.assigneeId;

  const plan = planAssetState({ currentAssigneeId: before.assigneeId, nextStatus, nextAssigneeId: requestedAssignee });
  if (!plan.ok) return fail({ assigneeId: plan.error });

  const next: Asset = { ...before, ...patch, status: nextStatus, assigneeId: plan.assigneeId, updatedAt: ctx.now() };
  const tracked = diffFields(before, next, TRACKED_FIELDS);
  const statusChanged = before.status !== next.status;
  const locationChanged = before.locationId !== next.locationId;
  if (!tracked.length && !statusChanged && !locationChanged && plan.action.type === 'none') return ok(before);

  await tx.assets.put(next);
  const closeReason = await applyAction(ctx, tx, next, plan.action, opts.note ?? '', opts.endReason);

  const label = assetLabel(next);
  if (tracked.length) {
    await logEvent(ctx, tx, { type: 'asset.updated', entityType: 'asset', entityId: next.id, entityLabel: label, assetId: next.id, changes: tracked });
  }
  if (statusChanged) {
    await logEvent(ctx, tx, {
      type: 'asset.status_changed', entityType: 'asset', entityId: next.id, entityLabel: label, assetId: next.id,
      changes: [{ field: 'status', from: before.status, to: next.status }],
    });
  }
  if (locationChanged) {
    const name = (id: string | null): string | null => (id ? refs.locations.find((l) => l.id === id)?.name ?? null : null);
    await logEvent(ctx, tx, {
      type: 'asset.location_changed', entityType: 'asset', entityId: next.id, entityLabel: label, assetId: next.id,
      params: { from: name(before.locationId), to: name(next.locationId) },
    });
  }
  if (plan.action.type !== 'none') {
    const holder = (id: string | null): string | null => {
      const p = id ? refs.people.find((x) => x.id === id) : undefined;
      return p ? personLabel(p) : null;
    };
    await logEvent(ctx, tx, {
      type: 'asset.assignee_changed', entityType: 'asset', entityId: next.id, entityLabel: label, assetId: next.id,
      personId: next.assigneeId ?? before.assigneeId,
      params: { from: holder(before.assigneeId), to: holder(next.assigneeId), reason: closeReason ?? 'assigned' },
    });
  }
  return ok(next);
}
