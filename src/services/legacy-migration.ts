import { LEGACY_STORAGE_KEYS, LegacyParseError, parseLegacyJson, planLegacyMigration } from '@/domain/legacy-mapping';
import type { LegacyParseResult, MigrationReport } from '@/domain/legacy-mapping';
import type { Result } from '@/domain/types';
import { fail, ok } from '@/domain/types';
import { atomic } from './atomic';
import type { Ctx } from './context';
import { logEvent } from './context';

/** Read-only view of LocalStorage. The legacy keys are NEVER written, changed or removed. */
export interface StorageLike {
  getItem(key: string): string | null;
}

export type LegacyKey = 'v2' | 'v1' | 'file';

export interface LegacySource {
  key: LegacyKey;
  raw: string;
  /** Raw values of every legacy key found (all of them are copied into the backup). */
  backups: Partial<Record<'v2' | 'v1', string>>;
}

export interface LegacyMigrationRecord {
  status: 'done' | 'skipped';
  at: string;
  sourceKey?: LegacyKey;
  counts?: { assets: number; people: number; locations: number };
}

export interface LegacyBackup {
  at: string;
  sourceKey: LegacyKey;
  raw: Partial<Record<'v2' | 'v1', string>>;
}

/** Finds data from the previous apps. Prefers v1.1 (`...v2`) over v1.0 (`...v1`). */
export function detectLegacySource(storage: StorageLike): LegacySource | null {
  const backups: LegacySource['backups'] = {};
  try {
    const v2 = storage.getItem(LEGACY_STORAGE_KEYS.v2);
    const v1 = storage.getItem(LEGACY_STORAGE_KEYS.v1);
    if (v2 !== null) backups.v2 = v2;
    if (v1 !== null) backups.v1 = v1;
  } catch {
    return null; // storage blocked: behave as "no legacy data"
  }
  if (backups.v2 !== undefined) return { key: 'v2', raw: backups.v2, backups };
  if (backups.v1 !== undefined) return { key: 'v1', raw: backups.v1, backups };
  return null;
}

export async function getLegacyMigrationRecord(ctx: Ctx): Promise<LegacyMigrationRecord | undefined> {
  return ctx.store.read((tx) => tx.meta.get<LegacyMigrationRecord>('legacyMigration'));
}

export async function getLegacyBackup(ctx: Ctx): Promise<LegacyBackup | undefined> {
  return ctx.store.read((tx) => tx.meta.get<LegacyBackup>('legacyBackup'));
}

export async function skipLegacyMigration(ctx: Ctx): Promise<void> {
  await ctx.store.write(async (tx) => {
    await tx.meta.set('legacyMigration', { status: 'skipped', at: ctx.now() } satisfies LegacyMigrationRecord);
  });
}

export interface LegacyPreview {
  parsed: LegacyParseResult;
  report: MigrationReport;
}

/** Dry run: what *would* be created. Writes nothing. */
export async function previewLegacy(ctx: Ctx, raw: string): Promise<Result<LegacyPreview>> {
  let parsed: LegacyParseResult;
  try {
    parsed = parseLegacyJson(raw);
  } catch (e) {
    return fail({ _form: e instanceof LegacyParseError ? e.code : 'invalid_json' });
  }
  const existing = await ctx.store.read(async (tx) => {
    const [assets, people, locations] = await Promise.all([tx.assets.getAll(), tx.people.getAll(), tx.locations.getAll()]);
    return { assets, people, locations };
  });
  const plan = planLegacyMigration(parsed.devices, existing, { id: ctx.id, now: ctx.now });
  return ok({ parsed, report: plan.report });
}

export interface MigrationOutcome {
  report: MigrationReport;
  invalid: number;
  duplicateSerials: number;
}

/**
 * Imports legacy data in ONE transaction (all or nothing), then verifies what was written
 * before the transaction is allowed to commit. On any failure nothing is persisted.
 */
export async function runLegacyMigration(ctx: Ctx, source: LegacySource): Promise<Result<MigrationOutcome>> {
  let parsed: LegacyParseResult;
  try {
    parsed = parseLegacyJson(source.raw);
  } catch (e) {
    return fail({ _form: e instanceof LegacyParseError ? e.code : 'invalid_json' });
  }

  return atomic(ctx, async (tx) => {
    const [assets, people, locations] = await Promise.all([tx.assets.getAll(), tx.people.getAll(), tx.locations.getAll()]);
    const plan = planLegacyMigration(parsed.devices, { assets, people, locations }, { id: ctx.id, now: ctx.now });
    const at = ctx.now();

    if (source.key !== 'file') {
      await tx.meta.set('legacyBackup', { at, sourceKey: source.key, raw: source.backups } satisfies LegacyBackup);
    }
    for (const x of plan.locations) await tx.locations.put(x);
    for (const x of plan.people) await tx.people.put(x);
    for (const x of plan.assets) await tx.assets.put(x);
    for (const x of plan.assignments) await tx.assignments.put(x);
    for (const x of plan.activity) await tx.activity.put(x);

    // ---- verification (reads back from the same transaction; a throw aborts everything) ----
    const [assetsAfter, peopleAfter, locationsAfter, assignmentsAfter] = await Promise.all([
      tx.assets.getAll(), tx.people.getAll(), tx.locations.getAll(), tx.assignments.getAll(),
    ]);
    const serialsAfter = new Set(assetsAfter.map((a) => a.serialNumber.trim().toLowerCase()));
    const ok1 = assetsAfter.length === assets.length + plan.assets.length
      && peopleAfter.length === people.length + plan.people.length
      && locationsAfter.length === locations.length + plan.locations.length
      && assignmentsAfter.length >= plan.assignments.length
      && plan.assets.every((a) => serialsAfter.has(a.serialNumber.trim().toLowerCase()));
    if (!ok1) throw new Error('migration_verification_failed');

    await logEvent(ctx, tx, {
      type: source.key === 'file' ? 'data.imported' : 'data.migrated',
      entityType: 'system', entityId: 'legacy', entityLabel: source.key === 'file' ? 'Legacy JSON import' : 'Legacy data migration',
      params: {
        source: source.key, assets: plan.assets.length, people: plan.people.length, locations: plan.locations.length,
        skipped: plan.report.skippedExistingSerial.length + parsed.invalid.length + parsed.duplicateSerials.length,
      },
    });
    if (source.key !== 'file') {
      await tx.meta.set('legacyMigration', {
        status: 'done', at, sourceKey: source.key,
        counts: { assets: plan.assets.length, people: plan.people.length, locations: plan.locations.length },
      } satisfies LegacyMigrationRecord);
    }
    return ok({ report: plan.report, invalid: parsed.invalid.length, duplicateSerials: parsed.duplicateSerials.length });
  });
}
