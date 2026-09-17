import { Hono } from "hono";
import { createClient } from "@supabase/supabase-js";
import { ARC_MAINNET, USDC_ADDRESS } from "../lib/arc";
import { settlePayment, pollStatus } from "./facilitator";
import type { Payee } from "./proof";

/**
 * x402 gateway. Registered endpoints proxy through here; unpaid requests get a
 * 402 with payment requirements, paid requests are settled via the Circle
 * Facilitator and forwarded to the seller's upstream API.
 */

interface EndpointRow {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  upstream_url: string;
  price_usdc: number;
  sellers?: {
    payout_address: string | null;
    circle_wallet_id: string | null;
  } | null;
}

function supabase() {
  return createClient(
    process.env.SUPABASE_URL ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  );
}

export const x402Gateway = new Hono();

x402Gateway.all("/:slug", async (c) => {
  const slug = c.req.param("slug");
  const db = supabase();

  const { data: endpoint, error } = await db
    .from("endpoints")
    .select("id,slug,name,description,upstream_url,price_usdc,sellers(payout_address,circle_wallet_id)")
    .eq("slug", slug)
    .single<EndpointRow>();

  if (error || !endpoint) {
    return c.json({ error: "Unknown endpoint" }, 404);
  }

  const payee: Payee = endpoint.sellers?.payout_address
    ? {
        payTo: endpoint.sellers.payout_address,
        circleWalletId: endpoint.sellers.circle_wallet_id,
      }
    : { payTo: process.env.TREASURY_ADDRESS ?? "" };

  const resource = {
    url: c.req.url,
    description: endpoint.description ?? endpoint.name,
    mimeType: "application/json",
  };

  const requirements = {
    scheme: "exact",
    network: ARC_MAINNET.network,
    amount: Math.round(endpoint.price_usdc * 1_000_000).toString(),
    asset: USDC_ADDRESS,
    payTo: payee.payTo,
    maxTimeoutSeconds: 300,
    extra: { name: "USDC", version: "2" },
  };

  const paymentSignature = c.req.header("payment-signature");
  if (!paymentSignature) {
    return c.json(
      {
        x402Version: 2,
        resource,
        accepts: [requirements],
      },
      402,
      { "payment-required": btoa(JSON.stringify({ x402Version: 2, resource, accepts: [requirements] })) },
    );
  }

  // Paid call: settle via facilitator, then proxy upstream.
  let paymentPayload: unknown;
  try {
    paymentPayload = JSON.parse(atob(paymentSignature));
  } catch {
    return c.json({ error: "Malformed Payment-Signature header" }, 400);
  }

  try {
    const settle = await settlePayment(paymentPayload, requirements, payee);
    const finalStatus =
      settle.status === "completed"
        ? "completed"
        : await pollStatus(settle.paymentId, settle.retryAfterMs, payee);
    if (finalStatus !== "completed") {
      return c.json({ error: "Payment not settled", status: finalStatus }, 402);
    }

    await db.from("payments").insert({
      endpoint_id: endpoint.id,
      payment_id: settle.paymentId,
      amount_usdc: endpoint.price_usdc,
      buyer: (paymentPayload as { payload?: { authorization?: { from?: string } } })
        ?.payload?.authorization?.from ?? null,
      pay_to: payee.payTo,
    });
  } catch (err) {
    return c.json(
      { error: "Settlement failed", detail: err instanceof Error ? err.message : String(err) },
      502,
    );
  }

  // Forward to the seller's upstream API.
  const upstreamUrl = new URL(endpoint.upstream_url);
  const incoming = new URL(c.req.url);
  upstreamUrl.search = incoming.search;
  const upstream = await fetch(upstreamUrl, {
    method: c.req.method,
    headers: { "content-type": c.req.header("content-type") ?? "application/json" },
    body: c.req.method === "GET" || c.req.method === "HEAD" ? undefined : await c.req.text(),
  });
  const body = await upstream.arrayBuffer();
  return new Response(body, {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
  });
});
