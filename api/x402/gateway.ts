// x402 payment gateway for registered marketplace endpoints.
// Flow: unpaid request -> 402 + PAYMENT-REQUIRED -> buyer retries with
// Payment-Signature -> we settle via Circle Facilitator on Arc -> proxy the
// call to the seller's upstream API -> log the payment in Supabase.

import { Hono } from "hono";
import type { HttpBindings } from "@hono/node-server";
import { sbSelect, sbInsert } from "../lib/supabase";
import {
  ARC_NETWORK,
  ARC_EXPLORER,
  TREASURY_ADDRESS,
  USDC_ADDRESS,
  USDC_EIP712_NAME,
  USDC_EIP712_VERSION,
  toBaseUnits,
  x402Configured,
} from "./config";
import {
  settlePayment,
  pollStatus,
  type PaymentRequirements,
} from "./facilitator";

interface EndpointRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  upstream_url: string;
  price_usdc: string;
}

export const x402Gateway = new Hono<{ Bindings: HttpBindings }>();

const HOP_BY_HOP = new Set([
  "host",
  "connection",
  "content-length",
  "payment-signature",
  "x-payment",
  "transfer-encoding",
  "accept-encoding",
]);

x402Gateway.all("/:slug", async (c) => {
  const slug = c.req.param("slug");

  const rows = await sbSelect<EndpointRow>(
    "endpoints",
    `slug=eq.${encodeURIComponent(slug)}&active=eq.true&select=id,slug,name,description,upstream_url,price_usdc`,
  );
  const endpoint = rows[0];
  if (!endpoint) {
    return c.json({ error: "Unknown or inactive endpoint", slug }, 404);
  }

  const resourceUrl = new URL(c.req.url);
  const requirements: PaymentRequirements = {
    scheme: "exact",
    network: ARC_NETWORK,
    amount: toBaseUnits(endpoint.price_usdc),
    asset: USDC_ADDRESS,
    payTo: TREASURY_ADDRESS,
    maxTimeoutSeconds: 60,
    extra: {
      name: USDC_EIP712_NAME,
      version: USDC_EIP712_VERSION,
      assetTransferMethod: "eip3009",
    },
  };

  const paymentHeader =
    c.req.header("payment-signature") ?? c.req.header("x-payment");

  // ---- Unpaid request: return the 402 challenge ---------------------------
  if (!paymentHeader) {
    const paymentRequired = {
      x402Version: 2,
      resource: {
        url: resourceUrl.toString(),
        description: endpoint.description || endpoint.name,
        mimeType: "application/json",
      },
      accepts: [requirements],
    };
    const encoded = Buffer.from(JSON.stringify(paymentRequired)).toString(
      "base64",
    );
    return new Response(JSON.stringify(paymentRequired), {
      status: 402,
      headers: {
        "Content-Type": "application/json",
        "PAYMENT-REQUIRED": encoded,
      },
    });
  }

  // ---- Paid request: settle then serve ------------------------------------
  const cfg = x402Configured();
  if (!cfg.ok) {
    return c.json(
      {
        error: "Settlement not configured on this deployment",
        missing: cfg.missing,
      },
      503,
    );
  }

  let paymentPayload: unknown;
  try {
    paymentPayload = JSON.parse(
      Buffer.from(paymentHeader, "base64").toString("utf8"),
    );
  } catch {
    return c.json({ error: "Malformed Payment-Signature header" }, 400);
  }

  const settled = await settlePayment(paymentPayload, requirements);

  let txHash = settled.transaction ?? "";
  let payer = settled.payer ?? "";

  if (!settled.success && settled.pending) {
    const final = await pollStatus(
      settled.pending.paymentId,
      settled.pending.retryAfterMs,
    );
    if (final.status !== "completed") {
      return c.json(
        { error: "Payment settlement did not complete", status: final.status },
        402,
      );
    }
    txHash = final.transaction ?? "";
  } else if (!settled.success) {
    return c.json({ error: settled.error ?? "Settlement failed" }, 402);
  }

  // Log the settled payment.
  await sbInsert("payments", {
    endpoint_id: endpoint.id,
    payer_address: payer || "unknown",
    amount_usdc: endpoint.price_usdc,
    tx_hash: txHash || null,
    network: "arc",
    status: "settled",
  }).catch((e) => console.error("payment log failed:", e));

  // Proxy the call to the seller's upstream API.
  const upstreamUrl = new URL(endpoint.upstream_url);
  resourceUrl.searchParams.forEach((v, k) =>
    upstreamUrl.searchParams.append(k, v),
  );

  const fwdHeaders = new Headers();
  c.req.raw.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) fwdHeaders.set(key, value);
  });

  const hasBody = !["GET", "HEAD"].includes(c.req.method);
  const upstream = await fetch(upstreamUrl, {
    method: c.req.method,
    headers: fwdHeaders,
    body: hasBody ? await c.req.raw.arrayBuffer() : undefined,
  });

  const responseHeaders = new Headers();
  const contentType = upstream.headers.get("content-type");
  if (contentType) responseHeaders.set("Content-Type", contentType);
  responseHeaders.set(
    "X-Payment-Receipt",
    JSON.stringify({
      network: ARC_NETWORK,
      amount: requirements.amount,
      transaction: txHash,
      explorer: txHash ? `${ARC_EXPLORER}/tx/${txHash}` : null,
    }),
  );

  return new Response(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
});
