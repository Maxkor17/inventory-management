import { isOneOf, ASSET_STATUSES } from '@/domain/enums';
import type { AssetStatus } from '@/domain/enums';
import { planAssetState } from '@/domain/assignment';
import type { Asset, AssetInput, Result } from '@/domain/types';
import { fail, ok } from '@/domain/types';
import { validateAssetInput } from '@/domain/validation';
import type { Ctx } from './context';
import { assetLabel, logEvent } from './context';
import { atomic, TxAbort } from './atomic';
import { commitAssetChange } from './asset-core';
import type { AssetPatch } from './asset-core';

async function loadRefs(tx: import('@/data/store').Tx) {
  const [assets, people, locations] = await Promise.all([tx.assets.getAll(), tx.people.getAll(), tx.locations.getAll()]);
  return { assets, people, locations };
}

/** Creates an asset inside an existing transaction (used by `createAsset` and the CSV import). */
export async function createAssetInTx(
  ctx: Ctx, tx: import('@/data/store').Tx, input: AssetInput,
  refs: { assets: readonly Asset[]; people: readonly import('@/domain/types').Person[]; locations: readonly import('@/domain/types').Location[] },
  opts: { isDemo?: boolean; eventType?: 'asset.created' | 'asset.imported' } = {},
): Promise<Result<Asset>> {
  const checked = validateAssetInput(input, refs);
  if (!checked.ok) return checked;
  const v = checked.value;

  const plan = planAssetState({ currentAssigneeId: null, nextStatus: v.status, nextAssigneeId: v.assigneeId });
  if (!plan.ok) return fail({ assigneeId: plan.error });

  const now = ctx.now();
  const asset: Asset = { ...v, assigneeId: plan.assigneeId, id: ctx.id(), isDemo: opts.isDemo ?? false, createdAt: now, updatedAt: now };
  await tx.assets.put(asset);
  if (asset.assigneeId) {
    await tx.assignments.put({
      id: ctx.id(), assetId: asset.id, personId: asset.assigneeId, assignedAt: now,
      returnedAt: null, endReason: null, note: opts.eventType === 'asset.imported' ? 'Imported' : '', isDemo: asset.isDemo,
    });
  }
  await logEvent(ctx, tx, {
    type: opts.eventType ?? 'asset.created', entityType: 'asset', entityId: asset.id, entityLabel: assetLabel(asset),
    assetId: asset.id, personId: asset.assigneeId,
  });
  return ok(asset);
}

export async function createAsset(ctx: Ctx, input: AssetInput, opts: { isDemo?: boolean } = {}): Promise<Result<Asset>> {
  return ctx.store.write(async (tx) => createAssetInTx(ctx, tx, input, await loadRefs(tx), opts));
}

export async function updateAsset(ctx: Ctx, id: string, input: AssetInput): Promise<Result<Asset>> {
  return ctx.store.write(async (tx) => {
    const before = await tx.assets.get(id);
    if (!before) return fail<Asset>({ _form: 'not_found' });
    const refs = await loadRefs(tx);
    const checked = validateAssetInput(input, refs, { selfId: id, currentAssigneeId: before.assigneeId });
    if (!checked.ok) return checked;
    return commitAssetChange(ctx, tx, before, checked.value, refs);
  });
}

/** Deletes an asset with its assignments and tickets. Activity entries are kept (with a label snapshot). */
export async function deleteAsset(ctx: Ctx, id: string): Promise<Result<true>> {
  return ctx.store.write(async (tx) => {
    const asset = await tx.assets.get(id);
    if (!asset) return fail<true>({ _form: 'not_found' });
    const [assignments, tickets] = await Promise.all([tx.assignments.getAll(), tx.tickets.getAll()]);
    for (const a of assignments) if (a.assetId === id) await tx.assignments.delete(a.id);
    for (const t of tickets) if (t.assetId === id) await tx.tickets.delete(t.id);
    await tx.assets.delete(id);
    await logEvent(ctx, tx, {
      type: 'asset.deleted', entityType: 'asset', entityId: id, entityLabel: assetLabel(asset),
      assetId: id, personId: asset.assigneeId,
    });
    return ok(true as const);
  });
}

/** Gives the asset to an active person; `in_stock`/`reserved` assets become `in_use`. */
export async function assignAsset(ctx: Ctx, assetId: string, personId: string, note = ''): Promise<Result<Asset>> {
  return ctx.store.write(async (tx) => {
    const before = await tx.assets.get(assetId);
    if (!before) return fail<Asset>({ _form: 'not_found' });
    const person = await tx.people.get(personId);
    if (!person) return fail<Asset>({ assigneeId: 'unknown_person' });
    if (person.status !== 'active') return fail<Asset>({ assigneeId: 'person_inactive' });
    if (before.status === 'retired' || before.status === 'lost') return fail<Asset>({ _form: 'asset_not_assignable' });

    const refs = await loadRefs(tx);
    const status: AssetStatus = before.status === 'in_stock' || before.status === 'reserved' ? 'in_use' : before.status;
    return commitAssetChange(ctx, tx, before, { assigneeId: personId, status }, refs, { note });
  });
}

/** Takes the asset back from its holder and puts it in stock. */
export async function returnAssetToStock(ctx: Ctx, assetId: string, note = ''): Promise<Result<Asset>> {
  return ctx.store.write(async (tx) => {
    const before = await tx.assets.get(assetId);
    if (!before) return fail<Asset>({ _form: 'not_found' });
    if (before.status === 'retired' || before.status === 'lost') return fail<Asset>({ _form: 'asset_not_assignable' });
    const refs = await loadRefs(tx);
    return commitAssetChange(ctx, tx, before, { status: 'in_stock', assigneeId: null }, refs, { note });
  });
}

export type BulkPatch = Pick<AssetPatch, 'status' | 'locationId' | 'assigneeId'>;

/**
 * Applies the same status/location/holder change to many assets in ONE transaction.
 * If any asset fails a rule, nothing is changed and the failing assets are reported.
 */
export async function bulkUpdateAssets(
  ctx: Ctx, ids: readonly string[], patch: BulkPatch,
): Promise<Result<{ changed: number }>> {
  return atomic(ctx, async (tx) => {
    if (patch.status !== undefined && !isOneOf(ASSET_STATUSES, patch.status)) return fail<{ changed: number }>({ status: 'invalid_enum' });
    const refs = await loadRefs(tx);
    if (patch.locationId && !refs.locations.some((l) => l.id === patch.locationId)) return fail<{ changed: number }>({ locationId: 'unknown_location' });
    if (patch.assigneeId) {
      const p = refs.people.find((x) => x.id === patch.assigneeId);
      if (!p) return fail<{ changed: number }>({ assigneeId: 'unknown_person' });
      if (p.status !== 'active') return fail<{ changed: number }>({ assigneeId: 'person_inactive' });
    }

    const errors: Record<string, string> = {};
    let changed = 0;
    for (const id of ids) {
      const before = await tx.assets.get(id);
      if (!before) { errors[id] = 'not_found'; continue; }
      const r = await commitAssetChange(ctx, tx, before, patch, refs);
      if (!r.ok) { errors[id] = Object.values(r.errors)[0] ?? 'invalid'; continue; }
      if (r.value !== before) changed++;
    }
    // All-or-nothing: any failing asset rolls back every change made above.
    if (Object.keys(errors).length) throw new TxAbort(errors);
    return ok({ changed });
  });
}
