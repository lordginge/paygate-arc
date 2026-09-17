// Circle Facilitator Service client: settle + status for x402 exact-scheme
// USDC payments on Arc. Auth = Circle API key (Bearer) + seller proof header.

import { buildSellerProof } from "./proof";
import { CIRCLE_API_KEY, FACILITATOR_BASE } from "./config";

export interface PaymentRequirements {
  scheme: "exact";
  network: string;
  amount: string;
  asset: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra: { name: string; version: string; assetTransferMethod?: string };
}

export interface SettleResult {
  success: boolean;
  payer?: string;
  transaction?: string;
  network?: string;
  amount?: string;
  pending?: {
    paymentId: string;
    statusUrl: string;
    retryAfterMs: number;
  };
  error?: string;
}

async function facilitatorFetch(
  path: string,
  purpose: "verify" | "settle" | "status",
  body?: unknown,
): Promise<Response> {
  const bodyStr = body ? JSON.stringify(body) : "";
  const proof = await buildSellerProof(purpose, body ? "POST" : "GET", bodyStr);
  return fetch(`${FACILITATOR_BASE}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${CIRCLE_API_KEY}`,
      "Facilitator-Seller-Proof": proof,
    },
    body: body ? bodyStr : undefined,
  });
}

function makePaymentId(): string {
  // Idempotency id: 16-128 chars from [A-Za-z0-9_-]
  return `pay_${crypto.randomUUID().replace(/-/g, "")}`;
}

export async function settlePayment(
  paymentPayload: unknown,
  paymentRequirements: PaymentRequirements,
): Promise<SettleResult> {
  const body = {
    x402Version: 2,
    paymentPayload: {
      ...(paymentPayload as Record<string, unknown>),
      extensions: {
        "payment-identifier": {
          info: { required: true, id: makePaymentId() },
        },
      },
    },
    paymentRequirements,
  };

  const res = await facilitatorFetch("/settle", "settle", body);
  const data = (await res.json()) as Record<string, unknown>;

  if (res.ok && data.success === true) {
    return {
      success: true,
      payer: data.payer as string,
      transaction: data.transaction as string,
      network: data.network as string,
      amount: data.amount as string,
    };
  }

  // Pending shape: poll /status until terminal.
  const ext = data.extensions as
    | Record<string, { status?: string; paymentId?: string; statusUrl?: string; retryAfterMs?: number }>
    | undefined;
  const pending = ext?.["settlement-status"];
  if (pending?.status === "pending" && pending.paymentId) {
    return {
      success: false,
      payer: data.payer as string,
      pending: {
        paymentId: pending.paymentId,
        statusUrl:
          pending.statusUrl ??
          `${FACILITATOR_BASE}/status/${pending.paymentId}`,
        retryAfterMs: pending.retryAfterMs ?? 1000,
      },
    };
  }

  return {
    success: false,
    error:
      (data.error as string) ??
      (data.message as string) ??
      `settle failed with HTTP ${res.status}: ${JSON.stringify(data)}`,
  };
}

export async function pollStatus(
  paymentId: string,
  retryAfterMs: number,
  maxAttempts = 20,
): Promise<{ status: string; transaction?: string; reason?: string | null }> {
  let delay = retryAfterMs;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise((r) => setTimeout(r, delay));
    const res = await facilitatorFetch(`/status/${paymentId}`, "status");
    const data = (await res.json()) as {
      status?: string;
      transaction?: string;
      reason?: string | null;
    };
    if (data.status === "completed" || data.status === "failed") {
      return {
        status: data.status,
        transaction: data.transaction,
        reason: data.reason,
      };
    }
    delay = Math.min(delay * 1.5, 5000);
  }
  return { status: "timeout" };
}
