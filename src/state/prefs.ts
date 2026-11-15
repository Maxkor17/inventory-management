import { effect, signal } from '@preact/signals';
import { DEFAULT_WARRANTY_SOON_DAYS } from '@/domain/warranty';

export type Lang = 'en' | 'uk';
export type Theme = 'system' | 'light' | 'dark';

export interface Prefs {
  lang: Lang;
  theme: Theme;
  pageSize: number;
  warrantySoonDays: number;
  currency: string;
  /** Visible columns per table (by table id). Missing = defaults. */
  columns: Record<string, string[]>;
}

const KEY = 'itam.prefs';

function detectLang(): Lang {
  try {
    return (navigator.language || 'en').toLowerCase().startsWith('uk') ? 'uk' : 'en';
  } catch {
    return 'en';
  }
}

const DEFAULTS: Prefs = {
  lang: detectLang(), theme: 'system', pageSize: 25, warrantySoonDays: DEFAULT_WARRANTY_SOON_DAYS, currency: 'USD', columns: {},
};

function load(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const p = JSON.parse(raw) as Partial<Prefs>;
    return {
      lang: p.lang === 'uk' || p.lang === 'en' ? p.lang : DEFAULTS.lang,
      theme: p.theme === 'light' || p.theme === 'dark' || p.theme === 'system' ? p.theme : 'system',
      pageSize: [10, 25, 50, 100].includes(p.pageSize as number) ? (p.pageSize as number) : 25,
      warrantySoonDays: Number.isInteger(p.warrantySoonDays) && (p.warrantySoonDays as number) > 0 && (p.warrantySoonDays as number) <= 365
        ? (p.warrantySoonDays as number) : DEFAULT_WARRANTY_SOON_DAYS,
      currency: typeof p.currency === 'string' && /^[A-Z]{3}$/.test(p.currency) ? p.currency : 'USD',
      columns: p.columns && typeof p.columns === 'object' ? p.columns : {},
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export const prefs = signal<Prefs>(load());

export function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]): void {
  prefs.value = { ...prefs.value, [key]: value };
}

/** Persists preferences and mirrors them onto <html> (theme + lang). Call once at startup. */
export function installPrefsEffects(): void {
  effect(() => {
    const p = prefs.value;
    document.documentElement.dataset.theme = p.theme;
    document.documentElement.lang = p.lang;
    try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* storage blocked: preferences just won't persist */ }
  });
}
