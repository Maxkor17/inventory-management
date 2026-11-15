import { COLLECTION_NAMES } from '@/data/store';
import { isActivityEvent, isAsset, isAssignment, isLocation, isPerson, isTicket } from '@/domain/guards';
import type { BackupFile, Result } from '@/domain/types';
import { fail, ok } from '@/domain/types';
import { normText } from '@/domain/util';
import type { Ctx } from './context';
import { atomic } from './atomic';
import { logEvent } from './context';
import { loadSnapshot } from './queries';

export const BACKUP_SCHEMA = 'itam-backup' as const;
export const BACKUP_VERSION = 3 as const;

export async function buildBackup(ctx: Ctx): Promise<BackupFile> {
  const s = await loadSnapshot(ctx);
  return { schema: BACKUP_SCHEMA, version: BACKUP_VERSION, exportedAt: ctx.now(), data: s };
}

export const serializeBackup = (b: BackupFile): string => JSON.stringify(b, null, 2);

export type BackupParseError =
  | 'invalid_json' | 'invalid_schema' | 'unsupported_version' | 'invalid_records' | 'broken_references';

export type BackupParse =
  | { ok: true; value: BackupFile }
  | { ok: false; error: BackupParseError; detail?: string };

const bad = (error: BackupParseError, detail?: string): BackupParse => ({ ok: false, error, ...(detail ? { detail } : {}) });

/** Validates structure, enum values and referential integrity. Nothing is written here. */
export function parseBackup(text: string): BackupParse {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return bad('invalid_json'); }
  if (!raw || typeof raw !== 'object' || (raw as { schema?: unknown }).schema !== BACKUP_SCHEMA) return bad('invalid_schema');
  const file = raw as { version?: unknown; exportedAt?: unknown; data?: unknown };
  if (file.version !== BACKUP_VERSION) return bad('unsupported_version', String(file.version));
  if (!file.data || typeof file.data !== 'object') return bad('invalid_schema');
  const data = file.data as Record<string, unknown>;

  const guards = {
    assets: isAsset, people: isPerson, locations: isLocation,
    assignments: isAssignment, tickets: isTicket, activity: isActivityEvent,
  } as const;
  for (const name of COLLECTION_NAMES) {
    const list = data[name];
    if (!Array.isArray(list)) return bad('invalid_schema', name);
    const ids = new Set<string>();
    for (let i = 0; i < list.length; i++) {
      const item = list[i] as { id?: string };
      if (!guards[name](item)) return bad('invalid_records', `${name}[${i}]`);
      if (ids.has(item.id!)) return bad('invalid_records', `${name}[${i}] duplicate id`);
      ids.add(item.id!);
    }
  }

  const value = { schema: BACKUP_SCHEMA, version: BACKUP_VERSION, exportedAt: String(file.exportedAt ?? ''), data } as unknown as BackupFile;
  const { assets, people, locations, assignments, tickets } = value.data;
  const assetIds = new Set(assets.map((a) => a.id));
  const personIds = new Set(people.map((p) => p.id));
  const locationIds = new Set(locations.map((l) => l.id));

  const invNumbers = new Set<string>();
  const serials = new Set<string>();
  for (const a of assets) {
    if (a.locationId && !locationIds.has(a.locationId)) return bad('broken_references', `asset ${a.id} location`);
    if (a.assigneeId && !personIds.has(a.assigneeId)) return bad('broken_references', `asset ${a.id} assignee`);
    const inv = normText(a.inventoryNumber);
    if (!inv || invNumbers.has(inv)) return bad('invalid_records', `asset ${a.id} inventory number`);
    invNumbers.add(inv);
    if (a.serialNumber) {
      const s = normText(a.serialNumber);
      if (serials.has(s)) return bad('invalid_records', `asset ${a.id} serial number`);
      serials.add(s);
    }
  }
  for (const p of people) {
    if (p.locationId && !locationIds.has(p.locationId)) return bad('broken_references', `person ${p.id} location`);
  }
  for (const t of tickets) {
    if (!assetIds.has(t.assetId)) return bad('broken_references', `ticket ${t.id} asset`);
    if (t.specialistId && !personIds.has(t.specialistId)) return bad('broken_references', `ticket ${t.id} specialist`);
  }
  const activeByAsset = new Map<string, string>();
  for (const a of assignments) {
    if (!assetIds.has(a.assetId) || !personIds.has(a.personId)) return bad('broken_references', `assignment ${a.id}`);
    if (a.returnedAt === null) {
      if (activeByAsset.has(a.assetId)) return bad('invalid_records', `asset ${a.assetId} has several active assignments`);
      activeByAsset.set(a.assetId, a.personId);
    }
  }
  for (const a of assets) {
    if ((activeByAsset.get(a.id) ?? null) !== a.assigneeId) return bad('invalid_records', `asset ${a.id} holder does not match assignments`);
  }
  return { ok: true, value };
}

/** Replaces ALL data with the backup's content, atomically. Callers should offer a safety download first. */
export async function restoreBackup(ctx: Ctx, text: string): Promise<Result<{ assets: number; people: number }>> {
  const parsed = parseBackup(text);
  if (!parsed.ok) return fail({ _form: parsed.error });
  const { data } = parsed.value;

  return atomic(ctx, async (tx) => {
    for (const name of COLLECTION_NAMES) await tx[name].clear();
    for (const x of data.locations) await tx.locations.put(x);
    for (const x of data.people) await tx.people.put(x);
    for (const x of data.assets) await tx.assets.put(x);
    for (const x of data.assignments) await tx.assignments.put(x);
    for (const x of data.tickets) await tx.tickets.put(x);
    for (const x of data.activity) await tx.activity.put(x);
    await logEvent(ctx, tx, {
      type: 'data.restored', entityType: 'system', entityId: 'restore', entityLabel: 'Backup restore',
      params: { assets: data.assets.length, people: data.people.length, locations: data.locations.length, tickets: data.tickets.length },
    });
    return ok({ assets: data.assets.length, people: data.people.length });
  });
}
