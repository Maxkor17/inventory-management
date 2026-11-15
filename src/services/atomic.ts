import type { Tx } from '@/data/store';
import type { Errors, Result } from '@/domain/types';
import { fail } from '@/domain/types';
import type { Ctx } from './context';

/** Throw inside `atomic` to roll back every write made so far and report validation errors. */
export class TxAbort extends Error {
  constructor(public readonly errors: Errors) {
    super('tx_abort');
    this.name = 'TxAbort';
  }
}

/** Runs `fn` in one write transaction; a `TxAbort` rolls everything back and becomes a failed Result. */
export async function atomic<T>(ctx: Ctx, fn: (tx: Tx) => Promise<Result<T>>): Promise<Result<T>> {
  try {
    return await ctx.store.write(fn);
  } catch (e) {
    if (e instanceof TxAbort) return fail<T>(e.errors);
    throw e;
  }
}
