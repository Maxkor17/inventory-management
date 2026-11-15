import { prefs } from '@/state/prefs';
import type { Lang } from '@/state/prefs';
import { en } from './en';
import { uk } from './uk';

export type TKey = keyof typeof en;
/** Base names of plural groups, i.e. keys that exist as `<base>_other`. */
export type PluralBase = TKey extends infer K ? (K extends `${infer B}_other` ? B : never) : never;

export const dictionaries: Record<Lang, Record<TKey, string>> = { en, uk };

type Params = Record<string, string | number>;

function interpolate(s: string, params?: Params): string {
  if (!params) return s;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));
}

/** Translate. Reads the language signal, so components re-render when it changes. */
export function t(key: TKey, params?: Params): string {
  const lang = prefs.value.lang;
  return interpolate(dictionaries[lang][key] ?? en[key] ?? key, params);
}

/** Translate a key built from a code (e.g. `status.in_use`). */
export function tc(prefix: string, code: string): string {
  return t(`${prefix}.${code}` as TKey);
}

/** Plural-aware translate: looks up `<base>_one|few|many|other` using Intl.PluralRules. */
export function tn(base: PluralBase, count: number, params?: Params): string {
  const lang = prefs.value.lang;
  const rule = new Intl.PluralRules(lang).select(count);
  const dict = dictionaries[lang];
  const key = (`${base}_${rule}` in dict ? `${base}_${rule}` : `${base}_other`) as TKey;
  return interpolate(dict[key], { count, ...params });
}

const locale = (): string => (prefs.value.lang === 'uk' ? 'uk-UA' : 'en-GB');

/** Date-only strings (YYYY-MM-DD) are shown without any timezone shift. */
export function fmtDate(date: string): string {
  if (!date) return '';
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Intl.DateTimeFormat(locale(), { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function fmtDateTime(iso: string): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat(locale(), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
}

export function fmtMoney(amount: number | null): string {
  if (amount === null) return '';
  try {
    return new Intl.NumberFormat(locale(), { style: 'currency', currency: prefs.value.currency }).format(amount);
  } catch {
    return String(amount);
  }
}

export const fmtNumber = (n: number): string => new Intl.NumberFormat(locale()).format(n);
