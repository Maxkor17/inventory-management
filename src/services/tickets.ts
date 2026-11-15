import { diffFields } from '@/domain/activity-diff';
import type { AssetStatus } from '@/domain/enums';
import { canTransition } from '@/domain/maintenance';
import type { Asset, Errors, Result, Ticket, TicketInput } from '@/domain/types';
import { fail, ok } from '@/domain/types';
import { validateTicketInput } from '@/domain/validation';
import type { TicketStatus } from '@/domain/enums';
import { atomic, TxAbort } from './atomic';
import { commitAssetChange } from './asset-core';
import type { Ctx } from './context';
import { assetLabel, logEvent } from './context';

const TRACKED = ['title', 'problem', 'priority', 'specialistId', 'workDone', 'cost'] as const;

export interface TransitionOptions {
  workDone?: string;
  cost?: number | null;
  /** When starting work: also mark the asset "under repair". */
  setAssetUnderRepair?: boolean;
  /** When resolving/closing: put the asset back to this status. */
  restoreAssetStatus?: AssetStatus | null;
}

const isRetiredOrLost = (a: Asset): boolean => a.status === 'retired' || a.status === 'lost';

export async function createTicket(
  ctx: Ctx, input: TicketInput, opts: { setAssetUnderRepair?: boolean; isDemo?: boolean } = {},
): Promise<Result<Ticket>> {
  return atomic(ctx, async (tx) => {
    const [assets, people, locations] = await Promise.all([tx.assets.getAll(), tx.people.getAll(), tx.locations.getAll()]);
    const checked = validateTicketInput(input, { assets, people });
    if (!checked.ok) return checked;
    const asset = assets.find((a) => a.id === checked.value.assetId)!;

    const now = ctx.now();
    const ticket: Ticket = {
      ...checked.value, id: ctx.id(), status: 'open', createdAt: now, updatedAt: now,
      resolvedAt: null, closedAt: null, isDemo: opts.isDemo ?? false,
    };

    if (opts.setAssetUnderRepair) {
      if (isRetiredOrLost(asset)) return fail({ _form: 'asset_not_assignable' });
      const r = await commitAssetChange(ctx, tx, asset, { status: 'under_repair' }, { people, locations });
      if (!r.ok) throw new TxAbort(r.errors);
    }
    await tx.tickets.put(ticket);
    await logEvent(ctx, tx, {
      type: 'ticket.created', entityType: 'ticket', entityId: ticket.id, entityLabel: ticket.title,
      assetId: asset.id, params: { asset: assetLabel(asset), priority: ticket.priority },
    });
    return ok(ticket);
  });
}

/** Edits the descriptive fields. The asset cannot be changed and closed tickets are read-only. */
export async function updateTicket(ctx: Ctx, id: string, input: TicketInput): Promise<Result<Ticket>> {
  return ctx.store.write(async (tx) => {
    const before = await tx.tickets.get(id);
    if (!before) return fail<Ticket>({ _form: 'not_found' });
    if (before.status === 'closed') return fail<Ticket>({ _form: 'ticket_closed' });
    const [assets, people] = await Promise.all([tx.assets.getAll(), tx.people.getAll()]);
    const checked = validateTicketInput({ ...input, assetId: before.assetId }, { assets, people });
    if (!checked.ok) return checked;

    const next: Ticket = { ...before, ...checked.value, assetId: before.assetId, updatedAt: ctx.now() };
    const changes = diffFields(before, next, TRACKED);
    if (!changes.length) return ok(before);
    await tx.tickets.put(next);
    await logEvent(ctx, tx, {
      type: 'ticket.updated', entityType: 'ticket', entityId: id, entityLabel: next.title, assetId: next.assetId, changes,
    });
    return ok(next);
  });
}

export async function transitionTicket(
  ctx: Ctx, id: string, to: TicketStatus, opts: TransitionOptions = {},
): Promise<Result<Ticket>> {
  return atomic(ctx, async (tx) => {
    const before = await tx.tickets.get(id);
    if (!before) return fail({ _form: 'not_found' });
    if (!canTransition(before.status, to)) return fail({ _form: 'invalid_transition' });

    const workDone = (opts.workDone ?? before.workDone).trim();
    const cost = opts.cost !== undefined ? opts.cost : before.cost;
    if (cost !== null && (!Number.isFinite(cost) || cost < 0)) return fail({ cost: 'invalid_number' });
    if (to === 'resolved' && !workDone) return fail({ workDone: 'required' });

    const now = ctx.now();
    const next: Ticket = {
      ...before, status: to, workDone, cost, updatedAt: now,
      resolvedAt: to === 'resolved' ? now : to === 'in_progress' ? null : before.resolvedAt,
      closedAt: to === 'closed' ? now : before.closedAt,
    };

    const [people, locations] = await Promise.all([tx.people.getAll(), tx.locations.getAll()]);
    const asset = await tx.assets.get(before.assetId);
    const assetPatch: { status: AssetStatus } | null =
      to === 'in_progress' && opts.setAssetUnderRepair ? { status: 'under_repair' }
        : (to === 'resolved' || to === 'closed') && opts.restoreAssetStatus ? { status: opts.restoreAssetStatus }
          : null;
    if (assetPatch) {
      if (!asset) return fail({ _form: 'asset_missing' });
      if (isRetiredOrLost(asset)) return fail({ _form: 'asset_not_assignable' });
      const r = await commitAssetChange(ctx, tx, asset, assetPatch, { people, locations });
      if (!r.ok) throw new TxAbort(r.errors as Errors);
    }

    await tx.tickets.put(next);
    await logEvent(ctx, tx, {
      type: to === 'resolved' ? 'ticket.resolved' : 'ticket.status_changed',
      entityType: 'ticket', entityId: id, entityLabel: next.title, assetId: next.assetId,
      changes: [{ field: 'status', from: before.status, to }],
    });
    return ok(next);
  });
}

export async function deleteTicket(ctx: Ctx, id: string): Promise<Result<true>> {
  return ctx.store.write(async (tx) => {
    const ticket = await tx.tickets.get(id);
    if (!ticket) return fail<true>({ _form: 'not_found' });
    await tx.tickets.delete(id);
    await logEvent(ctx, tx, {
      type: 'ticket.deleted', entityType: 'ticket', entityId: id, entityLabel: ticket.title, assetId: ticket.assetId,
    });
    return ok(true as const);
  });
}
