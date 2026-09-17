import { buildSellerProof, type Payee } from "./proof";

/**
 * Circle Facilitator Service client. All calls are authenticated with the
 * server-side CIRCLE_API_KEY plus a per-request Facilitator-Seller-Proof
 * signed by the payee's key (Circle wallet or legacy treasury key).
 */

const FACILITATOR_BASE = "https://api.circle.com/v1/facilitator/x402";

export interface SettleResult {
  paymentId: string;
  status: string;
  retryAfterMs?: number;
}

async function facilitatorFetch(
  path: string,
  purpose: "verify" | "settle" | "status",
  payee: Payee,
  body?: unknown,
): Promise<Response> {
  const method = body === undefined ? "GET" : "POST";
  const proof = await buildSellerProof(purpose, method, body, payee);
  return fetch(`${FACILITATOR_BASE}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.CIRCLE_API_KEY ?? ""}`,
      "facilitator-seller-proof": proof,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export async function settlePayment(
  paymentPayload: unknown,
  paymentRequirements: unknown,
  payee: Payee,
): Promise<SettleResult> {
  const res = await facilitatorFetch(
    "/settle",
    "settle",
    payee,
    { paymentPayload, paymentRequirements },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Facilitator settle failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as {
    paymentId?: string;
    status?: string;
    retryAfter?: number;
  };
  if (!data.paymentId || !data.status) {
    throw new Error("Facilitator settle returned malformed response");
  }
  return {
    paymentId: data.paymentId,
    status: data.status,
    retryAfterMs: data.retryAfter,
  };
}

export async function pollStatus(
  paymentId: string,
  retryAfterMs: number | undefined,
  payee: Payee,
  maxAttempts = 20,
): Promise<string> {
  let wait = Math.max(retryAfterMs ?? 1000, 500);
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, wait));
    const res = await facilitatorFetch(
      `/status?paymentId=${encodeURIComponent(paymentId)}`,
      "status",
      payee,
    );
    if (!res.ok) {
      throw new Error(`Facilitator status failed: ${res.status}`);
    }
    const data = (await res.json()) as {
      status?: string;
      retryAfter?: number;
    };
    if (data.status === "completed" || data.status === "failed") {
      return data.status;
    }
    wait = Math.max(data.retryAfter ?? wait, 500);
  }
  throw new Error("Facilitator status polling timed out");
}
