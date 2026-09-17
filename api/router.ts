import { createRouter, publicQuery } from "./middleware";
import { marketplaceRouter } from "./marketplace";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  marketplace: marketplaceRouter,
});

export type AppRouter = typeof appRouter;
