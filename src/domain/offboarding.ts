import type { Asset, Errors, Person } from './types';

export type OffboardingDecision =
  | { kind: 'transfer'; toPersonId: string }
  | { kind: 'stock' };

/** Active assets currently held by a person. */
export function assetsHeldBy(assets: readonly Asset[], personId: string): Asset[] {
  return assets.filter((a) => a.assigneeId === personId);
}

/**
 * Every held asset needs a decision; transfer targets must be other *active* people.
 * Returns errors keyed by assetId (empty object = plan is valid).
 */
export function validateOffboarding(
  personId: string,
  assets: readonly Asset[],
  people: readonly Person[],
  decisions: Readonly<Record<string, OffboardingDecision | undefined>>,
): Errors {
  const errors: Errors = {};
  for (const asset of assetsHeldBy(assets, personId)) {
    const d = decisions[asset.id];
    if (!d) { errors[asset.id] = 'missing_decision'; continue; }
    if (d.kind === 'transfer') {
      const target = people.find((p) => p.id === d.toPersonId);
      if (!target || target.status !== 'active' || target.id === personId) errors[asset.id] = 'invalid_target';
    }
  }
  return errors;
}
