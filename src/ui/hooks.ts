import { useState } from 'preact/hooks';
import type { Errors } from '@/domain/types';
import { replaceQuery, route } from '@/router/router';

/**
 * List state (search, filters, sort, page) lives in the URL query so that lists are
 * bookmarkable and dashboard cards can deep-link into a filtered view.
 */
export function useListQuery() {
  const q = route.value.query; // reading the signal subscribes the component
  const get = (key: string): string => q.get(key) ?? '';
  const set = (patch: Record<string, string | undefined>): void => {
    const next: Record<string, string | undefined> = Object.fromEntries(q.entries());
    Object.assign(next, patch);
    if (!('page' in patch)) next.page = undefined; // any filter change returns to page 1
    replaceQuery(next);
  };
  return { get, set };
}

export function useForm<T extends object>(initial: T) {
  const [values, setValues] = useState<T>(initial);
  const [errors, setErrors] = useState<Errors>({});
  const set = <K extends keyof T>(key: K, value: T[K]): void => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!(key as string in prev)) return prev;
      const { [key as string]: _removed, ...rest } = prev;
      return rest;
    });
  };
  return { values, set, errors, setErrors, setValues };
}

export function useSet(): { set: ReadonlySet<string>; toggle: (id: string) => void; toggleAll: (ids: string[], on: boolean) => void; clear: () => void } {
  const [set, setSet] = useState<ReadonlySet<string>>(new Set());
  return {
    set,
    toggle: (id) => setSet((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }),
    toggleAll: (ids, on) => setSet((s) => { const n = new Set(s); for (const id of ids) { if (on) n.add(id); else n.delete(id); } return n; }),
    clear: () => setSet(new Set()),
  };
}
