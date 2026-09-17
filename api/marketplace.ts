import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import { sbSelect, sbInsert, sbUpsert } from "./lib/supabase";
import { ARC_NETWORK, x402Configured, TREASURY_ADDRESS } from "./x402/config";
import {
  walletsReady,
  createSellerWallet,
  getWalletUsdcBalance,
  withdrawTo,
} from "./circle/wallets";

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
      const walletAddress = input.walletAddress.toLowerCase();
      const existing = await sbSelect<{
        id: string;
        circle_wallet_id: string | null;
        payout_address: string | null;
      }>(
        "sellers",
        `wallet_address=eq.${walletAddress}&select=id,circle_wallet_id,payout_address`,
      );

      // Provision a Circle payout wallet on first registration when Circle
      // Wallets is configured. New endpoints then settle straight to it.
      let payout: { circle_wallet_id?: string; payout_address?: string } = {};
      if (walletsReady() && !existing[0]?.circle_wallet_id) {
        try {
          const w = await createSellerWallet();
          payout = { circle_wallet_id: w.walletId, payout_address: w.address.toLowerCase() };
        } catch (e) {
          console.error("circle wallet creation failed:", e);
        }
      }

      const rows = await sbUpsert(
        "sellers",
        {
          wallet_address: walletAddress,
          display_name: input.displayName,
          ...payout,
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

      // Live on-chain balance of the seller's Circle payout wallet, if any.
      let payoutAddress: string | null = null;
      let payoutBalance: number | null = null;
      const sellerFull = await sbSelect<{
        circle_wallet_id: string | null;
        payout_address: string | null;
      }>("sellers", `id=eq.${seller.id}&select=circle_wallet_id,payout_address`);
      const sw = sellerFull[0];
      if (sw?.circle_wallet_id && walletsReady()) {
        payoutAddress = sw.payout_address;
        try {
          payoutBalance = await getWalletUsdcBalance(sw.circle_wallet_id);
        } catch (e) {
          console.error("balance lookup failed:", e);
        }
      }

      return { seller, endpoints, payments, totalEarned: total, payoutAddress, payoutBalance };
    }),

  withdraw: publicQuery
    .input(z.object({ walletAddress: z.string().regex(walletRe) }))
    .mutation(async ({ input }) => {
      const sellers = await sbSelect<{
        id: string;
        wallet_address: string;
        circle_wallet_id: string | null;
        payout_address: string | null;
      }>(
        "sellers",
        `wallet_address=eq.${input.walletAddress.toLowerCase()}&select=id,wallet_address,circle_wallet_id,payout_address`,
      );
      const seller = sellers[0];
      if (!seller?.circle_wallet_id) {
        throw new Error("No Circle payout wallet for this seller");
      }
      const balance = await getWalletUsdcBalance(seller.circle_wallet_id);
      if (balance <= 0) throw new Error("Nothing to withdraw");

      const txId = await withdrawTo(
        seller.circle_wallet_id,
        seller.wallet_address,
        balance.toFixed(6),
      );
      return { transactionId: txId, amount: balance, to: seller.wallet_address };
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
