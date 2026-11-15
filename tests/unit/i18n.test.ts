import { describe, expect, it } from 'vitest';
import { ACTIVITY_TYPES, ASSET_STATUSES, CATEGORIES, END_REASONS, PERSON_STATUSES, TICKET_PRIORITIES, TICKET_STATUSES } from '@/domain/enums';
import { dictionaries, fmtDate, t, tc, tn } from '@/i18n';
import { en } from '@/i18n/en';
import { uk } from '@/i18n/uk';
import { prefs, setPref } from '@/state/prefs';

const placeholders = (s: string): string[] => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();

describe('i18n dictionaries', () => {
  it('Ukrainian has exactly the same keys as English', () => {
    expect(Object.keys(uk).sort()).toEqual(Object.keys(en).sort());
  });

  it('no translation is empty', () => {
    for (const lang of ['en', 'uk'] as const) {
      for (const [k, v] of Object.entries(dictionaries[lang])) expect(v.trim(), `${lang}:${k}`).not.toBe('');
    }
  });

  it('placeholders are identical in both languages', () => {
    for (const k of Object.keys(en) as (keyof typeof en)[]) {
      expect(placeholders(uk[k]), k).toEqual(placeholders(en[k]));
    }
  });

  it('every plural group has all four forms', () => {
    const bases = Object.keys(en).filter((k) => k.endsWith('_other')).map((k) => k.slice(0, -'_other'.length));
    expect(bases.length).toBeGreaterThan(10);
    for (const b of bases) for (const form of ['one', 'few', 'many', 'other']) expect(`${b}_${form}` in en, `${b}_${form}`).toBe(true);
  });

  it('codes stored in the database all have a translation (these keys are built dynamically)', () => {
    const need: string[] = [];
    CATEGORIES.forEach((c) => need.push(`category.${c}`));
    ASSET_STATUSES.forEach((s) => need.push(`status.${s}`));
    PERSON_STATUSES.forEach((s) => need.push(`person_status.${s}`));
    TICKET_PRIORITIES.forEach((s) => need.push(`priority.${s}`));
    TICKET_STATUSES.forEach((s) => need.push(`ticket_status.${s}`));
    [...END_REASONS, 'assigned'].forEach((s) => need.push(`reason.${s}`));
    ACTIVITY_TYPES.forEach((s) => need.push(`event.${s}`));
    ['all', 'asset', 'person', 'ticket', 'location', 'system'].forEach((s) => need.push(`activity.scope_${s}`));
    ['expired', 'soon', 'valid', 'none'].forEach((s) => need.push(`filter.warranty_${s}`));
    ['upload', 'review', 'done'].forEach((s) => need.push(`import.step_${s}`));
    ['light', 'system', 'dark'].forEach((s) => need.push(`theme.${s}`));
    ['invalid_json', 'invalid_schema', 'unsupported_version', 'invalid_records', 'broken_references'].forEach((s) => need.push(`restore.${s}`));
    // every field name that can appear in an activity "changes" list
    ['inventoryNumber', 'name', 'manufacturer', 'model', 'serialNumber', 'category', 'supplier', 'cost', 'purchaseDate', 'commissionedDate',
      'warrantyEndDate', 'description', 'notes', 'status', 'firstName', 'lastName', 'position', 'department', 'email', 'phone', 'startDate',
      'location', 'title', 'problem', 'priority', 'specialistId', 'workDone'].forEach((s) => need.push(`field.${s}`));
    // every validation / service error code surfaced through errorText()
    ['required', 'too_long', 'invalid_enum', 'invalid_date', 'invalid_number', 'invalid_email', 'duplicate_inventory_number', 'duplicate_serial',
      'duplicate_email', 'duplicate_name', 'date_before_purchase', 'unknown_location', 'unknown_person', 'unknown_asset', 'person_inactive',
      'in_use_requires_assignee', 'status_conflicts_with_assignee', 'not_found', 'has_assets', 'asset_not_assignable', 'asset_missing',
      'ticket_closed', 'invalid_transition', 'missing_decision', 'invalid_target', 'nothing_to_change', 'location_in_use', 'demo_exists',
      'demo_failed', 'demo_in_use', 'no_demo', 'file_unreadable', 'csv_empty', 'csv_too_large', 'csv_bad_quote', 'invalid_json',
      'invalid_structure', 'newer_version', 'unknown', 'invalid'].forEach((s) => need.push(`err.${s}`));
    for (const k of need) {
      expect(k in en, `en:${k}`).toBe(true);
      expect(k in uk, `uk:${k}`).toBe(true);
    }
  });
});

describe('translation runtime', () => {
  it('switches language reactively and interpolates parameters', () => {
    setPref('lang', 'en');
    expect(t('table.showing', { from: 1, to: 25, total: 100 })).toBe('Showing 1–25 of 100');
    expect(tc('status', 'in_use')).toBe('In use');
    setPref('lang', 'uk');
    expect(t('table.showing', { from: 1, to: 25, total: 100 })).toBe('Показано 1–25 з 100');
    expect(tc('status', 'in_use')).toBe('Використовується');
    setPref('lang', 'en');
  });

  it('uses the correct Ukrainian plural form (one / few / many)', () => {
    setPref('lang', 'uk');
    const f = (n: number): string => tn('assets.count', n);
    expect(f(1)).toBe('1 актив');
    expect(f(2)).toBe('2 активи');
    expect(f(4)).toBe('4 активи');
    expect(f(5)).toBe('5 активів');
    expect(f(11)).toBe('11 активів');
    expect(f(12)).toBe('12 активів');
    expect(f(21)).toBe('21 актив');
    expect(f(22)).toBe('22 активи');
    expect(f(25)).toBe('25 активів');
    expect(f(0)).toBe('0 активів');
    expect(f(101)).toBe('101 актив');
    setPref('lang', 'en');
  });

  it('uses English one / other', () => {
    setPref('lang', 'en');
    expect(tn('assets.count', 1)).toBe('1 asset');
    expect(tn('assets.count', 2)).toBe('2 assets');
    expect(tn('assets.count', 0)).toBe('0 assets');
  });

  it('formats date-only strings without a timezone shift', () => {
    setPref('lang', 'en');
    expect(fmtDate('2026-03-01')).toContain('1');
    expect(fmtDate('2026-03-01')).toContain('2026');
    expect(fmtDate('')).toBe('');
    expect(prefs.value.lang).toBe('en');
  });
});
