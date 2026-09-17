import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import { sbSelect, sbInsert, sbUpsert } from "./lib/supabase";
import { ARC_NETWORK, x402Configured, TREASURY_ADDRESS } from "./x402/config";

const walletRe = /^0x[a-fA-F0-9]{40}$/;
const slugRe = /^[a-z0-9][a-z0-9-]{1,60}$/;

export const marketplaceRouter = createRouter({
  listEndpoints: publicQuery.query(async () => {
    return sbSelect(
      "endpoints",
      "active=eq.true&order=created_at.desc&select=id,slug,name,description,category,price_usdc,created_at,sellers(wallet_address,display_name)",
    );
  }),

  getEndpoint: publicQuery
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      const rows = await sbSelect(
        "endpoints",
        `slug=eq.${encodeURIComponent(input.slug)}&select=id,slug,name,description,category,price_usdc,created_at,sellers(wallet_address,display_name)`,
      );
      return rows[0] ?? null;
    }),

  registerSeller: publicQuery
    .input(
      z.object({
        walletAddress: z.string().regex(walletRe, "Invalid EVM address"),
        displayName: z.string().min(1).max(80),
      }),
    )
    .mutation(async ({ input }) => {
      const rows = await sbUpsert(
        "sellers",
        {
          wallet_address: input.walletAddress.toLowerCase(),
          display_name: input.displayName,
        },
        "wallet_address",
      );
      return rows[0];
    }),

  createEndpoint: publicQuery
    .input(
      z.object({
        walletAddress: z.string().regex(walletRe),
        slug: z
          .string()
          .regex(slugRe, "Lowercase letters, numbers and dashes only"),
        name: z.string().min(1).max(120),
        description: z.string().max(500).default(""),
        category: z.string().max(40).default("general"),
        upstreamUrl: z.string().url().startsWith("https://"),
        priceUsdc: z.number().positive().max(100),
      }),
    )
    .mutation(async ({ input }) => {
      const sellers = await sbSelect<{ id: string }>(
        "sellers",
        `wallet_address=eq.${input.walletAddress.toLowerCase()}&select=id`,
      );
      const seller = sellers[0];
      if (!seller) throw new Error("Register as a seller first");

      const rows = await sbInsert("endpoints", {
        seller_id: seller.id,
        slug: input.slug,
        name: input.name,
        description: input.description,
        category: input.category,
        upstream_url: input.upstreamUrl,
        price_usdc: input.priceUsdc,
      });
      return rows[0];
    }),

  recentPayments: publicQuery
    .input(z.object({ limit: z.number().min(1).max(100).default(25) }))
    .query(async ({ input }) => {
      return sbSelect(
        "payments",
        `order=created_at.desc&limit=${input.limit}&select=id,payer_address,amount_usdc,tx_hash,status,created_at,endpoints(slug,name)`,
      );
    }),

  sellerStats: publicQuery
    .input(z.object({ walletAddress: z.string().regex(walletRe) }))
    .query(async ({ input }) => {
      const sellers = await sbSelect<{ id: string }>(
        "sellers",
        `wallet_address=eq.${input.walletAddress.toLowerCase()}&select=id,display_name`,
      );
      const seller = sellers[0];
      if (!seller) return null;

      const endpoints = await sbSelect<{ id: string; slug: string; name: string; price_usdc: string }>(
        "endpoints",
        `seller_id=eq.${seller.id}&select=id,slug,name,price_usdc&order=created_at.desc`,
      );
      const ids = endpoints.map((e) => e.id);
      let payments: { amount_usdc: string; created_at: string; endpoints?: { slug: string } }[] = [];
      if (ids.length > 0) {
        payments = await sbSelect(
          "payments",
          `endpoint_id=in.(${ids.join(",")})&order=created_at.desc&limit=100&select=amount_usdc,created_at,endpoints(slug)`,
        );
      }
      const total = payments.reduce((s, p) => s + Number(p.amount_usdc), 0);
      return { seller, endpoints, payments, totalEarned: total };
    }),

  globalStats: publicQuery.query(async () => {
    const endpoints = await sbSelect<{ id: string }>(
      "endpoints",
      "active=eq.true&select=id",
    );
    const payments = await sbSelect<{ amount_usdc: string }>(
      "payments",
      "select=amount_usdc",
    );
    const volume = payments.reduce((s, p) => s + Number(p.amount_usdc), 0);
    return {
      endpointCount: endpoints.length,
      paymentCount: payments.length,
      volumeUsdc: volume,
      network: ARC_NETWORK,
      settlementReady: x402Configured().ok,
      treasury: TREASURY_ADDRESS || null,
    };
  }),
});
