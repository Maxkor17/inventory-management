import { daysBetween } from './util';

export const DEFAULT_WARRANTY_SOON_DAYS = 30;

export type WarrantyState =
  | { kind: 'none' }
  /** `days` = whole days since the warranty ended. */
  | { kind: 'expired'; days: number }
  /** `days` = whole days left (0 = ends today). */
  | { kind: 'soon'; days: number }
  | { kind: 'valid'; days: number };

export function warrantyState(
  warrantyEndDate: string,
  today: string,
  soonDays: number = DEFAULT_WARRANTY_SOON_DAYS,
): WarrantyState {
  if (!warrantyEndDate) return { kind: 'none' };
  const days = daysBetween(today, warrantyEndDate);
  if (days < 0) return { kind: 'expired', days: -days };
  if (days <= soonDays) return { kind: 'soon', days };
  return { kind: 'valid', days };
}
