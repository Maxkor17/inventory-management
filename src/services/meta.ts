import type { Ctx } from './context';

/** Small flags stored in the `meta` store. */
export const getWelcomed = (ctx: Ctx): Promise<boolean> =>
  ctx.store.read(async (tx) => (await tx.meta.get<boolean>('welcomed')) === true);

export const setWelcomed = (ctx: Ctx): Promise<void> =>
  ctx.store.write(async (tx) => { await tx.meta.set('welcomed', true); });
