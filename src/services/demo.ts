import { buildDemoData } from '@/data/demo-data';
import type { Result } from '@/domain/types';
import { fail, ok } from '@/domain/types';
import { todayISO } from '@/domain/util';
import { atomic } from './atomic';
import type { Ctx } from './context';
import { logEvent } from './context';

/** Adds the clearly-marked demo dataset (every row has `isDemo: true`). */
export async function loadDemoData(ctx: Ctx, today: string = todayISO()): Promise<Result<{ assets: number }>> {
  return atomic(ctx, async (tx) => {
    const [assets, people, locations] = await Promise.all([tx.assets.getAll(), tx.people.getAll(), tx.locations.getAll()]);
    if (assets.some((a) => a.isDemo) || people.some((p) => p.isDemo) || locations.some((l) => l.isDemo)) {
      return fail({ _form: 'demo_exists' });
    }
    const demo = buildDemoData({ id: ctx.id, now: ctx.now, today });
    for (const x of demo.locations) await tx.locations.put(x);
    for (const x of demo.people) await tx.people.put(x);
    for (const x of demo.assets) await tx.assets.put(x);
    for (const x of demo.assignments) await tx.assignments.put(x);
    for (const x of demo.tickets) await tx.tickets.put(x);
    for (const x of demo.activity) await tx.activity.put(x);
    await logEvent(ctx, tx, {
      type: 'data.demo_loaded', entityType: 'system', entityId: 'demo', entityLabel: 'Demo data',
      params: { assets: demo.assets.length, people: demo.people.length },
    });
    return ok({ assets: demo.assets.length });
  });
}

/**
 * Removes ONLY rows flagged `isDemo`. If any real (non-demo) record still points at demo data
 * (for example a real asset assigned to a demo person) nothing is removed.
 */
export async function removeDemoData(ctx: Ctx): Promise<Result<{ removed: number }>> {
  return atomic(ctx, async (tx) => {
    const [assets, people, locations, assignments, tickets, activity] = await Promise.all([
      tx.assets.getAll(), tx.people.getAll(), tx.locations.getAll(),
      tx.assignments.getAll(), tx.tickets.getAll(), tx.activity.getAll(),
    ]);
    const demoAssets = new Set(assets.filter((a) => a.isDemo).map((a) => a.id));
    const demoPeople = new Set(people.filter((p) => p.isDemo).map((p) => p.id));
    const demoLocations = new Set(locations.filter((l) => l.isDemo).map((l) => l.id));
    const demoTickets = new Set(tickets.filter((t) => t.isDemo).map((t) => t.id));
    const demoAssignments = new Set(assignments.filter((a) => a.isDemo).map((a) => a.id));
    if (!demoAssets.size && !demoPeople.size && !demoLocations.size) return fail({ _form: 'no_demo' });

    const blocked =
      assets.some((a) => !a.isDemo && ((a.assigneeId && demoPeople.has(a.assigneeId)) || (a.locationId && demoLocations.has(a.locationId)))) ||
      people.some((p) => !p.isDemo && p.locationId && demoLocations.has(p.locationId)) ||
      tickets.some((t) => !t.isDemo && (demoAssets.has(t.assetId) || (t.specialistId && demoPeople.has(t.specialistId)))) ||
      assignments.some((a) => !a.isDemo && (demoAssets.has(a.assetId) || demoPeople.has(a.personId)));
    if (blocked) return fail({ _form: 'demo_in_use' });

    for (const id of demoAssignments) await tx.assignments.delete(id);
    for (const id of demoTickets) await tx.tickets.delete(id);
    for (const id of demoAssets) await tx.assets.delete(id);
    for (const id of demoPeople) await tx.people.delete(id);
    for (const id of demoLocations) await tx.locations.delete(id);

    const gone = new Set([...demoAssets, ...demoPeople, ...demoLocations, ...demoTickets]);
    for (const e of activity) {
      if (gone.has(e.entityId) || (e.assetId && gone.has(e.assetId)) || (e.personId && gone.has(e.personId))) {
        await tx.activity.delete(e.id);
      }
    }
    const removed = demoAssets.size + demoPeople.size + demoLocations.size + demoTickets.size;
    await logEvent(ctx, tx, {
      type: 'data.demo_removed', entityType: 'system', entityId: 'demo', entityLabel: 'Demo data', params: { removed },
    });
    return ok({ removed });
  });
}
