import type { ActivityEvent, Asset, Assignment, Location, Person, Ticket } from '@/domain/types';
import type { Ctx } from './context';

export interface Snapshot {
  assets: Asset[];
  people: Person[];
  locations: Location[];
  assignments: Assignment[];
  tickets: Ticket[];
  activity: ActivityEvent[];
}

/** Reads every collection in one consistent read transaction. */
export async function loadSnapshot(ctx: Ctx): Promise<Snapshot> {
  return ctx.store.read(async (tx) => {
    const [assets, people, locations, assignments, tickets, activity] = await Promise.all([
      tx.assets.getAll(), tx.people.getAll(), tx.locations.getAll(),
      tx.assignments.getAll(), tx.tickets.getAll(), tx.activity.getAll(),
    ]);
    activity.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
    return { assets, people, locations, assignments, tickets, activity };
  });
}
