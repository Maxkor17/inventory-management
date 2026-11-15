import { signal } from '@preact/signals';

export interface Route {
  /** Path segments, e.g. ['assets', 'abc'] for `#/assets/abc`. */
  path: string[];
  query: URLSearchParams;
}

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#/, '');
  const [pathPart = '', queryPart = ''] = raw.split('?');
  const path = pathPart.split('/').filter(Boolean).map((s) => decodeURIComponent(s));
  return { path, query: new URLSearchParams(queryPart) };
}

export function buildHash(path: string[], query?: Record<string, string | undefined> | URLSearchParams): string {
  const p = '/' + path.map(encodeURIComponent).join('/');
  const q = new URLSearchParams();
  if (query instanceof URLSearchParams) query.forEach((v, k) => v && q.set(k, v));
  else if (query) for (const [k, v] of Object.entries(query)) if (v) q.set(k, v);
  const qs = q.toString();
  return '#' + p + (qs ? '?' + qs : '');
}

export const route = signal<Route>(parseHash(typeof location !== 'undefined' ? location.hash : ''));

export function installRouter(): void {
  window.addEventListener('hashchange', () => { route.value = parseHash(location.hash); });
  route.value = parseHash(location.hash);
}

export function navigate(path: string[], query?: Record<string, string | undefined>): void {
  location.hash = buildHash(path, query);
}

/** Updates the query string in place (no new history entry) — used by list filters. */
export function replaceQuery(query: Record<string, string | undefined>): void {
  const base = route.value.path;
  const hash = buildHash(base, query);
  if (hash === location.hash) return;
  history.replaceState(null, '', hash);
  route.value = parseHash(hash);
}

export const href = (path: string[], query?: Record<string, string | undefined>): string => buildHash(path, query);
