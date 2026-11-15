import { diffFields } from '@/domain/activity-diff';
import { assetsHeldBy, validateOffboarding } from '@/domain/offboarding';
import type { OffboardingDecision } from '@/domain/offboarding';
import type { FieldChange, Person, PersonInput, Result } from '@/domain/types';
import { fail, ok } from '@/domain/types';
import { validatePersonInput } from '@/domain/validation';
import { atomic, TxAbort } from './atomic';
import { commitAssetChange } from './asset-core';
import type { Ctx } from './context';
import { logEvent, personLabel } from './context';

const TRACKED = ['firstName', 'lastName', 'position', 'department', 'email', 'phone', 'startDate', 'notes'] as const;

export async function createPerson(ctx: Ctx, input: PersonInput, opts: { isDemo?: boolean } = {}): Promise<Result<Person>> {
  return ctx.store.write(async (tx) => {
    const [people, locations] = await Promise.all([tx.people.getAll(), tx.locations.getAll()]);
    const checked = validatePersonInput(input, { people, locations });
    if (!checked.ok) return checked;
    const now = ctx.now();
    const person: Person = {
      ...checked.value, id: ctx.id(), status: 'active', deactivatedAt: null,
      isDemo: opts.isDemo ?? false, createdAt: now, updatedAt: now,
    };
    await tx.people.put(person);
    await logEvent(ctx, tx, {
      type: 'person.created', entityType: 'person', entityId: person.id, entityLabel: personLabel(person), personId: person.id,
    });
    return ok(person);
  });
}

export async function updatePerson(ctx: Ctx, id: string, input: PersonInput): Promise<Result<Person>> {
  return ctx.store.write(async (tx) => {
    const before = await tx.people.get(id);
    if (!before) return fail<Person>({ _form: 'not_found' });
    const [people, locations] = await Promise.all([tx.people.getAll(), tx.locations.getAll()]);
    const checked = validatePersonInput(input, { people, locations }, { selfId: id });
    if (!checked.ok) return checked;

    const next: Person = { ...before, ...checked.value, updatedAt: ctx.now() };
    const changes: FieldChange[] = diffFields(before, next, TRACKED);
    if (before.locationId !== next.locationId) {
      const name = (lid: string | null): string | null => (lid ? locations.find((l) => l.id === lid)?.name ?? null : null);
      changes.push({ field: 'location', from: name(before.locationId), to: name(next.locationId) });
    }
    if (!changes.length) return ok(before);

    await tx.people.put(next);
    await logEvent(ctx, tx, {
      type: 'person.updated', entityType: 'person', entityId: id, entityLabel: personLabel(next), personId: id, changes,
    });
    return ok(next);
  });
}

/** Deactivation is blocked while the person still holds assets — use `offboardPerson` for that. */
export async function deactivatePerson(ctx: Ctx, id: string): Promise<Result<Person>> {
  return ctx.store.write(async (tx) => {
    const person = await tx.people.get(id);
    if (!person) return fail<Person>({ _form: 'not_found' });
    if (person.status === 'inactive') return ok(person);
    const assets = await tx.assets.getAll();
    if (assetsHeldBy(assets, id).length) return fail<Person>({ _form: 'has_assets' });

    const next: Person = { ...person, status: 'inactive', deactivatedAt: ctx.now(), updatedAt: ctx.now() };
    await tx.people.put(next);
    await logEvent(ctx, tx, {
      type: 'person.deactivated', entityType: 'person', entityId: id, entityLabel: personLabel(next), personId: id,
    });
    return ok(next);
  });
}

export async function reactivatePerson(ctx: Ctx, id: string): Promise<Result<Person>> {
  return ctx.store.write(async (tx) => {
    const person = await tx.people.get(id);
    if (!person) return fail<Person>({ _form: 'not_found' });
    if (person.status === 'active') return ok(person);
    const next: Person = { ...person, status: 'active', deactivatedAt: null, updatedAt: ctx.now() };
    await tx.people.put(next);
    await logEvent(ctx, tx, {
      type: 'person.reactivated', entityType: 'person', entityId: id, entityLabel: personLabel(next), personId: id,
    });
    return ok(next);
  });
}

/**
 * Employee leaves: every held asset is transferred to another active person or returned
 * to stock, then the person is deactivated — one transaction, all or nothing.
 * Assignment history is preserved (rows are closed with reason `offboarding`, never deleted).
 */
export async function offboardPerson(
  ctx: Ctx, personId: string, decisions: Readonly<Record<string, OffboardingDecision | undefined>>,
): Promise<Result<{ transferred: number; toStock: number }>> {
  return atomic(ctx, async (tx) => {
    const person = await tx.people.get(personId);
    if (!person) return fail({ _form: 'not_found' });
    if (person.status !== 'active') return fail({ _form: 'person_inactive' });

    const [assets, people, locations] = await Promise.all([tx.assets.getAll(), tx.people.getAll(), tx.locations.getAll()]);
    const errors = validateOffboarding(personId, assets, people, decisions);
    if (Object.keys(errors).length) return fail(errors);

    let transferred = 0;
    let toStock = 0;
    const note = `Offboarding: ${personLabel(person)}`;
    for (const asset of assetsHeldBy(assets, personId)) {
      const d = decisions[asset.id]!;
      const patch = d.kind === 'transfer'
        ? { assigneeId: d.toPersonId }
        // Keep an in-repair asset "under repair" (just without a holder); otherwise it goes to stock.
        : asset.status === 'under_repair' ? { assigneeId: null } : { status: 'in_stock' as const };
      const r = await commitAssetChange(ctx, tx, asset, patch, { people, locations }, { endReason: 'offboarding', note });
      if (!r.ok) throw new TxAbort({ [asset.id]: Object.values(r.errors)[0] ?? 'invalid' });
      if (d.kind === 'transfer') transferred++; else toStock++;
    }

    const next: Person = { ...person, status: 'inactive', deactivatedAt: ctx.now(), updatedAt: ctx.now() };
    await tx.people.put(next);
    await logEvent(ctx, tx, {
      type: 'person.offboarded', entityType: 'person', entityId: personId, entityLabel: personLabel(next), personId,
      params: { transferred, toStock },
    });
    await logEvent(ctx, tx, {
      type: 'person.deactivated', entityType: 'person', entityId: personId, entityLabel: personLabel(next), personId,
    });
    return ok({ transferred, toStock });
  });
}
