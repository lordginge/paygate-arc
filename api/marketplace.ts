import { z } from "zod";
import { publicProcedure, router } from "../router";
import { createClient } from "@supabase/supabase-js";
import {
  walletsReady,
  createSellerWallet,
  getWalletUsdcBalance,
  withdrawTo,
} from "./circle/wallets";

function supabase() {
  return createClient(
    process.env.SUPABASE_URL ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  );
}

export const marketplaceRouter = router({
  globalStats: publicProcedure.query(async () => {
    const db = supabase();
    const [{ count: endpointCount }, { data: payments }] = await Promise.all([
      db.from("endpoints").select("id", { count: "exact", head: true }),
      db.from("payments").select("amount_usdc"),
    ]);
    const volume = (payments ?? []).reduce(
      (sum, p) => sum + Number(p.amount_usdc),
      0,
    );
    return {
      endpointCount: endpointCount ?? 0,
      paymentCount: payments?.length ?? 0,
      volumeUsdc: volume,
      network: process.env.ARC_NETWORK ?? "eip155:5042",
      settlementReady: Boolean(process.env.CIRCLE_API_KEY),
      treasury: process.env.TREASURY_ADDRESS ?? null,
    };
  }),

  listEndpoints: publicProcedure.query(async () => {
    const db = supabase();
    const { data, error } = await db
      .from("endpoints")
      .select("id,slug,name,description,price_usdc,created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  }),

  registerSeller: publicProcedure
    .input(
      z.object({
        name: z.string().min(1).max(120),
        walletAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
      }),
    )
    .mutation(async ({ input }) => {
      const db = supabase();
      const { data: existing } = await db
        .from("sellers")
        .select("id,circle_wallet_id")
        .eq("wallet_address", input.walletAddress)
        .limit(1);

      // Provision a dedicated Circle payout wallet on Arc for new sellers.
      let payout: { walletId: string; address: string } | null = null;
      if (walletsReady() && !existing?.[0]?.circle_wallet_id) {
        try {
          payout = await createSellerWallet();
        } catch (err) {
          // Degrade gracefully: seller falls back to the platform treasury
          // until wallets are provisioned (Circle Console product toggle).
          console.error("Circle wallet provisioning failed:", err);
        }
      }

      const row = {
        name: input.name,
        wallet_address: input.walletAddress,
        circle_wallet_id: payout?.walletId ?? existing?.[0]?.circle_wallet_id ?? null,
        payout_address: payout?.address ?? null,
      };

      const { data, error } = existing?.[0]
        ? await db.from("sellers").update(row).eq("id", existing[0].id).select().single()
        : await db.from("sellers").insert(row).select().single();
      if (error) throw new Error(error.message);
      return { seller: data, payoutWallet: payout?.address ?? data.payout_address ?? null };
    }),

  createEndpoint: publicProcedure
    .input(
      z.object({
        sellerWallet: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
        name: z.string().min(1).max(120),
        description: z.string().max(500).optional(),
        upstreamUrl: z.string().url(),
        priceUsdc: z.number().positive().max(1000),
      }),
    )
    .mutation(async ({ input }) => {
      const db = supabase();
      const { data: seller, error: sellerErr } = await db
        .from("sellers")
        .select("id")
        .eq("wallet_address", input.sellerWallet)
        .single();
      if (sellerErr || !seller) throw new Error("Seller not registered");

      const slug = input.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")
        .slice(0, 48);

      const { data, error } = await db
        .from("endpoints")
        .insert({
          seller_id: seller.id,
          slug,
          name: input.name,
          description: input.description ?? null,
          upstream_url: input.upstreamUrl,
          price_usdc: input.priceUsdc,
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data;
    }),

  sellerStats: publicProcedure
    .input(z.object({ walletAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/) }))
    .query(async ({ input }) => {
      const db = supabase();
      const { data: seller, error } = await db
        .from("sellers")
        .select("id,name,circle_wallet_id,payout_address")
        .eq("wallet_address", input.walletAddress)
        .single();
      if (error || !seller) throw new Error("Seller not registered");

      const { data: endpoints } = await db
        .from("endpoints")
        .select("id,slug,name,price_usdc")
        .eq("seller_id", seller.id);

      const endpointIds = (endpoints ?? []).map((e) => e.id);
      const { data: payments } = endpointIds.length
        ? await db
            .from("payments")
            .select("amount_usdc")
            .in("endpoint_id", endpointIds)
        : { data: [] as Array<{ amount_usdc: number }> };

      const totalEarned = (payments ?? []).reduce(
        (sum, p) => sum + Number(p.amount_usdc),
        0,
      );

      let payoutBalance: number | null = null;
      if (seller.circle_wallet_id && walletsReady()) {
        try {
          payoutBalance = await getWalletUsdcBalance(seller.circle_wallet_id);
        } catch (err) {
          console.error("Circle balance lookup failed:", err);
        }
      }

      return {
        seller,
        endpoints: endpoints ?? [],
        payments: payments?.length ?? 0,
        totalEarned,
        payoutAddress: seller.payout_address,
        payoutBalance,
      };
    }),

  withdraw: publicProcedure
    .input(z.object({ walletAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/) }))
    .mutation(async ({ input }) => {
      if (!walletsReady()) {
        throw new Error("Payout wallets are not provisioned yet");
      }
      const db = supabase();
      const { data: seller, error } = await db
        .from("sellers")
        .select("id,wallet_address,circle_wallet_id")
        .eq("wallet_address", input.walletAddress)
        .single();
      if (error || !seller?.circle_wallet_id) {
        throw new Error("No payout wallet for this seller");
      }

      const balance = await getWalletUsdcBalance(seller.circle_wallet_id);
      if (balance <= 0) {
        throw new Error("Nothing to withdraw");
      }

      const transactionId = await withdrawTo(
        seller.circle_wallet_id,
        seller.wallet_address,
        balance.toFixed(6),
      );
      return { transactionId, amount: balance, to: seller.wallet_address };
    }),
});
