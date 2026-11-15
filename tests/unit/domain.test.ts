import { describe, expect, it } from 'vitest';
import { diffFields } from '@/domain/activity-diff';
import { planAssetState } from '@/domain/assignment';
import { CsvError, csvCell, parseCsv, toCsv, unguardCsvCell } from '@/domain/csv';
import { canTransition, isActiveTicket, nextTicketStatuses } from '@/domain/maintenance';
import { validateOffboarding } from '@/domain/offboarding';
import type { Asset, Location, Person } from '@/domain/types';
import { addDays, daysBetween, isRealDate, normText } from '@/domain/util';
import {
  validateAssetInput, validateLocationInput, validatePersonInput, validateTicketInput,
} from '@/domain/validation';
import { warrantyState } from '@/domain/warranty';
import { assetInput, locationInput, personInput, ticketInput } from '../helpers';

const asset = (over: Partial<Asset> = {}): Asset => ({
  ...assetInput(), id: 'a1', isDemo: false, createdAt: '', updatedAt: '', ...over,
} as Asset);
const person = (over: Partial<Person> = {}): Person => ({
  ...personInput(), id: 'p1', status: 'active', deactivatedAt: null, isDemo: false, createdAt: '', updatedAt: '', ...over,
});
const location = (over: Partial<Location> = {}): Location => ({ id: 'l1', name: 'Office', description: '', isDemo: false, createdAt: '', updatedAt: '', ...over });

describe('dates', () => {
  it('validates real calendar dates', () => {
    expect(isRealDate('2024-02-29')).toBe(true);
    expect(isRealDate('2023-02-29')).toBe(false);
    expect(isRealDate('2025-04-31')).toBe(false);
    expect(isRealDate('2025-13-01')).toBe(false);
    expect(isRealDate('2025-1-1')).toBe(false);
    expect(isRealDate('')).toBe(false);
  });
  it('computes day differences across month, year and leap boundaries', () => {
    expect(daysBetween('2026-11-15', '2026-12-15')).toBe(30);
    expect(daysBetween('2027-12-31', '2028-03-01')).toBe(61);
    expect(addDays('2028-02-28', 2)).toBe('2028-03-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
  it('normalises text for comparisons', () => {
    expect(normText('  Hello   WORLD ')).toBe('hello world');
  });
});

describe('warrantyState', () => {
  const today = '2026-11-15';
  it('classifies none / expired / soon / valid at the boundaries', () => {
    expect(warrantyState('', today)).toEqual({ kind: 'none' });
    expect(warrantyState('2026-11-14', today)).toEqual({ kind: 'expired', days: 1 });
    expect(warrantyState('2026-11-15', today)).toEqual({ kind: 'soon', days: 0 });
    expect(warrantyState('2026-12-15', today)).toEqual({ kind: 'soon', days: 30 });
    expect(warrantyState('2026-12-16', today)).toEqual({ kind: 'valid', days: 31 });
  });
  it('honours a custom threshold', () => {
    expect(warrantyState('2026-12-15', today, 10).kind).toBe('valid');
    expect(warrantyState('2026-11-20', today, 10).kind).toBe('soon');
  });
});

describe('validateAssetInput', () => {
  const ref = { assets: [asset({ id: 'x', inventoryNumber: 'IT-000009', serialNumber: 'SN-9' })], people: [person()], locations: [location()] };

  it('requires number, name and valid enums', () => {
    const r = validateAssetInput(assetInput({ inventoryNumber: ' ', name: '', category: 'bogus' as never, status: 'bogus' as never }), ref);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toMatchObject({ inventoryNumber: 'required', name: 'required', category: 'invalid_enum', status: 'invalid_enum' });
  });
  it('rejects duplicate inventory number and serial (case/space-insensitive) but not for the asset itself', () => {
    const dup = validateAssetInput(assetInput({ inventoryNumber: ' it-000009 ', serialNumber: 'sn-9' }), ref);
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.errors).toMatchObject({ inventoryNumber: 'duplicate_inventory_number', serialNumber: 'duplicate_serial' });
    expect(validateAssetInput(assetInput({ inventoryNumber: 'IT-000009', serialNumber: 'SN-9' }), ref, { selfId: 'x' }).ok).toBe(true);
  });
  it('allows an empty serial number for several assets', () => {
    const r = validateAssetInput(assetInput({ inventoryNumber: 'IT-000002', serialNumber: '' }), { ...ref, assets: [asset({ serialNumber: '' })] });
    expect(r.ok).toBe(true);
  });
  it('validates dates, ordering and cost', () => {
    const r = validateAssetInput(assetInput({ purchaseDate: '2025-05-01', commissionedDate: '2025-04-01', warrantyEndDate: '2025-02-31', cost: -1 }), ref);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toMatchObject({ commissionedDate: 'date_before_purchase', warrantyEndDate: 'invalid_date', cost: 'invalid_number' });
    expect(validateAssetInput(assetInput({ purchaseDate: '2025-05-01', warrantyEndDate: '2025-05-01', cost: 0 }), ref).ok).toBe(true);
  });
  it('checks references and inactive holders', () => {
    expect(validateAssetInput(assetInput({ locationId: 'nope' }), ref).ok).toBe(false);
    expect(validateAssetInput(assetInput({ status: 'in_use', assigneeId: 'nope' }), ref).ok).toBe(false);
    const inactive = { ...ref, people: [person({ status: 'inactive' })] };
    const r = validateAssetInput(assetInput({ status: 'in_use', assigneeId: 'p1' }), inactive);
    expect(r.ok).toBe(false);
    expect(validateAssetInput(assetInput({ status: 'in_use', assigneeId: 'p1' }), inactive, { currentAssigneeId: 'p1' }).ok).toBe(true);
  });
  it('trims values', () => {
    const r = validateAssetInput(assetInput({ name: '  Laptop  ' }), { assets: [], people: [], locations: [] });
    expect(r.ok && r.value.name).toBe('Laptop');
  });
});

describe('validatePersonInput / validateLocationInput / validateTicketInput', () => {
  it('requires first and last name; validates email format and uniqueness', () => {
    const ref = { people: [person({ id: 'p9', email: 'a@x.com' })], locations: [] };
    const r = validatePersonInput(personInput({ firstName: '', lastName: '', email: 'bad' }), ref);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toMatchObject({ firstName: 'required', lastName: 'required', email: 'invalid_email' });
    const dup = validatePersonInput(personInput({ email: 'A@X.com' }), ref);
    expect(!dup.ok && dup.errors.email).toBe('duplicate_email');
    expect(validatePersonInput(personInput({ email: 'A@X.com' }), ref, { selfId: 'p9' }).ok).toBe(true);
  });
  it('requires a unique location name', () => {
    const ref = { locations: [location({ name: 'Server Room' })] };
    const r = validateLocationInput(locationInput({ name: ' server   room ' }), ref);
    expect(!r.ok && r.errors.name).toBe('duplicate_name');
    expect(validateLocationInput(locationInput({ name: '' }), ref).ok).toBe(false);
  });
  it('requires an existing asset, a title and a problem for a ticket', () => {
    const ref = { assets: [asset()], people: [person()] };
    expect(validateTicketInput(ticketInput('a1'), ref).ok).toBe(true);
    const r = validateTicketInput(ticketInput('zzz', { title: '', problem: '', specialistId: 'nope' }), ref);
    expect(!r.ok && r.errors).toMatchObject({ assetId: 'unknown_asset', title: 'required', problem: 'required', specialistId: 'unknown_person' });
  });
});

describe('planAssetState', () => {
  it('in_use needs a holder', () => {
    expect(planAssetState({ currentAssigneeId: null, nextStatus: 'in_use', nextAssigneeId: null })).toEqual({ ok: false, error: 'in_use_requires_assignee' });
  });
  it('assigns, transfers, keeps', () => {
    expect(planAssetState({ currentAssigneeId: null, nextStatus: 'in_use', nextAssigneeId: 'p1' })).toMatchObject({ ok: true, action: { type: 'assign', personId: 'p1' } });
    expect(planAssetState({ currentAssigneeId: 'p1', nextStatus: 'in_use', nextAssigneeId: 'p2' })).toMatchObject({ action: { type: 'transfer', personId: 'p2' } });
    expect(planAssetState({ currentAssigneeId: 'p1', nextStatus: 'in_use', nextAssigneeId: 'p1' })).toMatchObject({ action: { type: 'none' } });
  });
  it('in_stock / retired / lost drop the holder with the right reason', () => {
    expect(planAssetState({ currentAssigneeId: 'p1', nextStatus: 'in_stock', nextAssigneeId: 'p1' })).toMatchObject({ assigneeId: null, action: { type: 'return', reason: 'returned_to_stock' } });
    expect(planAssetState({ currentAssigneeId: 'p1', nextStatus: 'retired', nextAssigneeId: 'p1' })).toMatchObject({ action: { type: 'return', reason: 'asset_retired' } });
    expect(planAssetState({ currentAssigneeId: 'p1', nextStatus: 'lost', nextAssigneeId: 'p1' })).toMatchObject({ action: { type: 'return', reason: 'asset_lost' } });
    expect(planAssetState({ currentAssigneeId: null, nextStatus: 'in_stock', nextAssigneeId: null })).toMatchObject({ action: { type: 'none' } });
  });
  it('rejects giving a *different* holder to a stock/retired asset', () => {
    expect(planAssetState({ currentAssigneeId: 'p1', nextStatus: 'in_stock', nextAssigneeId: 'p2' })).toEqual({ ok: false, error: 'status_conflicts_with_assignee' });
    expect(planAssetState({ currentAssigneeId: null, nextStatus: 'retired', nextAssigneeId: 'p2' })).toEqual({ ok: false, error: 'status_conflicts_with_assignee' });
  });
  it('under_repair / reserved may keep or drop the holder', () => {
    expect(planAssetState({ currentAssigneeId: 'p1', nextStatus: 'under_repair', nextAssigneeId: 'p1' })).toMatchObject({ assigneeId: 'p1', action: { type: 'none' } });
    expect(planAssetState({ currentAssigneeId: 'p1', nextStatus: 'under_repair', nextAssigneeId: null })).toMatchObject({ assigneeId: null, action: { type: 'return' } });
  });
});

describe('maintenance transitions', () => {
  it('follows the allowed matrix', () => {
    expect(canTransition('open', 'in_progress')).toBe(true);
    expect(canTransition('open', 'resolved')).toBe(false);
    expect(canTransition('resolved', 'in_progress')).toBe(true);
    expect(canTransition('closed', 'open')).toBe(false);
    expect(nextTicketStatuses('closed')).toEqual([]);
    expect(isActiveTicket('waiting')).toBe(true);
    expect(isActiveTicket('resolved')).toBe(false);
  });
});

describe('diffFields', () => {
  it('reports only real changes and treats ""/null as equal', () => {
    const a = { x: 'a', y: '', z: 1 };
    expect(diffFields(a, { x: 'b', y: '', z: 1 }, ['x', 'y', 'z'])).toEqual([{ field: 'x', from: 'a', to: 'b' }]);
    expect(diffFields({ v: '' as string | null }, { v: null }, ['v'])).toEqual([]);
  });
});

describe('offboarding validation', () => {
  const assets = [asset({ id: 'a1', assigneeId: 'p1', status: 'in_use' }), asset({ id: 'a2', assigneeId: 'p1', status: 'in_use' }), asset({ id: 'a3', assigneeId: 'p2' })];
  const people = [person({ id: 'p1' }), person({ id: 'p2' }), person({ id: 'p3', status: 'inactive' })];
  it('needs a decision for each held asset and an active, different target', () => {
    expect(validateOffboarding('p1', assets, people, { a1: { kind: 'stock' }, a2: { kind: 'transfer', toPersonId: 'p2' } })).toEqual({});
    expect(validateOffboarding('p1', assets, people, { a1: { kind: 'stock' } })).toEqual({ a2: 'missing_decision' });
    expect(validateOffboarding('p1', assets, people, { a1: { kind: 'transfer', toPersonId: 'p3' }, a2: { kind: 'transfer', toPersonId: 'p1' } })).toEqual({ a1: 'invalid_target', a2: 'invalid_target' });
  });
});

describe('csv', () => {
  it('parses quotes, escaped quotes, embedded newlines, CRLF and BOM', () => {
    const text = '﻿a,b,c\r\n"x, y","say ""hi""","line1\nline2"\r\n1,,3\r\n';
    expect(parseCsv(text).rows).toEqual([['a', 'b', 'c'], ['x, y', 'say "hi"', 'line1\nline2'], ['1', '', '3']]);
  });
  it('detects semicolon and tab delimiters', () => {
    expect(parseCsv('a;b\r\n1;2').delimiter).toBe(';');
    expect(parseCsv('a\tb\n1\t2').rows[1]).toEqual(['1', '2']);
  });
  it('drops blank lines and handles a missing final newline', () => {
    expect(parseCsv('a,b\n\n1,2').rows).toEqual([['a', 'b'], ['1', '2']]);
  });
  it('rejects an unterminated quote', () => {
    expect(() => parseCsv('a,"b')).toThrow(CsvError);
  });
  it('round-trips through toCsv', () => {
    const rows = [['name', 'note'], ['A, B', 'he said "x"'], ['multi\nline', '']];
    expect(parseCsv(toCsv(rows)).rows).toEqual(rows);
  });
  it('guards formula injection and can undo the guard; numbers are untouched', () => {
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('@cmd')).toBe("'@cmd");
    expect(csvCell(-5)).toBe('-5');
    expect(csvCell('normal')).toBe('normal');
    expect(unguardCsvCell("'=SUM(A1)")).toBe('=SUM(A1)');
    expect(unguardCsvCell("'normal")).toBe("'normal");
  });
});
