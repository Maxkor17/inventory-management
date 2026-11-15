import type { CsvImportPlan } from '@/domain/csv-assets';
import type { Location, Result } from '@/domain/types';
import { ok } from '@/domain/types';
import { normText } from '@/domain/util';
import { atomic } from './atomic';
import { createAssetInTx } from './assets';
import type { Ctx } from './context';
import { logEvent } from './context';

export interface CsvImportOutcome {
  imported: number;
  /** Rows that were invalid in the preview, or no longer valid when committing. */
  skipped: number;
  locationsCreated: number;
}

/**
 * Imports the valid rows of a previewed plan in ONE transaction.
 * Rows with errors are skipped. Locations that do not exist yet are created only when
 * `createMissingLocations` is set; otherwise rows that need them are skipped.
 */
export async function importAssetsFromCsv(
  ctx: Ctx, plan: CsvImportPlan, opts: { createMissingLocations: boolean },
): Promise<Result<CsvImportOutcome>> {
  return atomic(ctx, async (tx) => {
    const [assets, people, locations] = await Promise.all([tx.assets.getAll(), tx.people.getAll(), tx.locations.getAll()]);
    const locByName = new Map<string, Location>(locations.map((l) => [normText(l.name), l]));
    const now = ctx.now();
    let locationsCreated = 0;

    if (opts.createMissingLocations) {
      for (const name of plan.missingLocations) {
        if (locByName.has(normText(name))) continue;
        const loc: Location = { id: ctx.id(), name, description: '', isDemo: false, createdAt: now, updatedAt: now };
        await tx.locations.put(loc);
        locByName.set(normText(name), loc);
        locationsCreated++;
      }
    }

    const liveAssets = [...assets];
    const liveLocations = [...locByName.values()];
    let imported = 0;
    let skipped = 0;
    for (const row of plan.rows) {
      if (Object.keys(row.errors).length) { skipped++; continue; }
      let locationId: string | null = null;
      if (row.locationName) {
        const loc = locByName.get(normText(row.locationName));
        if (!loc) { skipped++; continue; } // location missing and not allowed to be created
        locationId = loc.id;
      }
      const r = await createAssetInTx(ctx, tx, { ...row.input, locationId }, { assets: liveAssets, people, locations: liveLocations }, { eventType: 'asset.imported' });
      if (!r.ok) { skipped++; continue; }
      liveAssets.push(r.value);
      imported++;
    }

    await logEvent(ctx, tx, {
      type: 'data.imported', entityType: 'system', entityId: 'csv', entityLabel: 'CSV import',
      params: { source: 'csv', assets: imported, skipped, locations: locationsCreated },
    });
    return ok({ imported, skipped, locationsCreated });
  });
}
