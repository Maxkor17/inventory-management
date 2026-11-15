import type { Location, LocationInput, Result } from '@/domain/types';
import { fail, ok } from '@/domain/types';
import { validateLocationInput } from '@/domain/validation';
import type { Ctx } from './context';
import { logEvent } from './context';

export async function createLocation(ctx: Ctx, input: LocationInput, opts: { isDemo?: boolean } = {}): Promise<Result<Location>> {
  return ctx.store.write(async (tx) => {
    const locations = await tx.locations.getAll();
    const checked = validateLocationInput(input, { locations });
    if (!checked.ok) return checked;
    const now = ctx.now();
    const location: Location = { ...checked.value, id: ctx.id(), isDemo: opts.isDemo ?? false, createdAt: now, updatedAt: now };
    await tx.locations.put(location);
    await logEvent(ctx, tx, { type: 'location.created', entityType: 'location', entityId: location.id, entityLabel: location.name });
    return ok(location);
  });
}

export async function updateLocation(ctx: Ctx, id: string, input: LocationInput): Promise<Result<Location>> {
  return ctx.store.write(async (tx) => {
    const before = await tx.locations.get(id);
    if (!before) return fail<Location>({ _form: 'not_found' });
    const locations = await tx.locations.getAll();
    const checked = validateLocationInput(input, { locations }, { selfId: id });
    if (!checked.ok) return checked;
    const next: Location = { ...before, ...checked.value, updatedAt: ctx.now() };
    if (next.name === before.name && next.description === before.description) return ok(before);
    await tx.locations.put(next);
    await logEvent(ctx, tx, {
      type: 'location.updated', entityType: 'location', entityId: id, entityLabel: next.name,
      changes: before.name !== next.name ? [{ field: 'name', from: before.name, to: next.name }] : [],
    });
    return ok(next);
  });
}

/** A location that is still referenced by assets or people cannot be deleted. */
export async function deleteLocation(ctx: Ctx, id: string): Promise<Result<true>> {
  return ctx.store.write(async (tx) => {
    const location = await tx.locations.get(id);
    if (!location) return fail<true>({ _form: 'not_found' });
    const [assets, people] = await Promise.all([tx.assets.getAll(), tx.people.getAll()]);
    if (assets.some((a) => a.locationId === id) || people.some((p) => p.locationId === id)) {
      return fail<true>({ _form: 'in_use' });
    }
    await tx.locations.delete(id);
    await logEvent(ctx, tx, { type: 'location.deleted', entityType: 'location', entityId: id, entityLabel: location.name });
    return ok(true as const);
  });
}
