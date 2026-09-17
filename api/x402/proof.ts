import { privateKeyToAccount } from "viem/accounts";
import { ARC_MAINNET } from "../lib/arc";
import { signSellerTypedData } from "../circle/wallets";

/**
 * Facilitator-Seller-Proof: an EIP-712 "Circle Facilitator Seller Request"
 * envelope signed by the payTo key holder, authorising one facilitator call.
 *
 * If the payee has a Circle developer-controlled wallet, the signature comes
 * from Circle's Sign API (no private key on our servers). Otherwise we fall
 * back to the legacy SELLER_PRIVATE_KEY treasury signer.
 */

export interface Payee {
  payTo: string;
  circleWalletId?: string | null;
}

const PROOF_DOMAIN = {
  name: "Circle Facilitator Seller Request",
  version: "1",
} as const;

const PROOF_TYPES = {
  EIP712Domain: [
    { name: "name", type: "string" },
    { name: "version", type: "string" },
  ],
  SellerRequest: [
    { name: "payTo", type: "address" },
    { name: "purpose", type: "string" },
    { name: "method", type: "string" },
    { name: "bodyHash", type: "bytes32" },
    { name: "issuedAt", type: "uint256" },
    { name: "expiresAt", type: "uint256" },
  ],
} as const;

async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return (
    "0x" +
    Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
  );
}

export async function buildSellerProof(
  purpose: "verify" | "settle" | "status",
  method: string,
  body: unknown,
  payee: Payee,
): Promise<string> {
  const issuedAtSec = Math.floor(Date.now() / 1000);
  const expiresAtSec = issuedAtSec + 300;
  const bodyHash = await sha256Hex(body === undefined ? "" : JSON.stringify(body));

  if (payee.circleWalletId) {
    // Circle Sign API: plain JSON, numbers for uint256 fields.
    const typedData = {
      domain: { ...PROOF_DOMAIN },
      types: { ...PROOF_TYPES },
      primaryType: "SellerRequest",
      message: {
        payTo: payee.payTo,
        purpose,
        method: method.toUpperCase(),
        bodyHash,
        issuedAt: issuedAtSec,
        expiresAt: expiresAtSec,
      },
    };
    const signature = await signSellerTypedData(payee.circleWalletId, typedData);
    return base64urlEncode(JSON.stringify({ typedData, signature }));
  }

  // Legacy treasury signer (SELLER_PRIVATE_KEY deploy secret).
  const key = process.env.SELLER_PRIVATE_KEY;
  if (!key) {
    throw new Error("No signer available for payTo " + payee.payTo);
  }
  const account = privateKeyToAccount(key as `0x${string}`);
  const typedData = {
    domain: { ...PROOF_DOMAIN },
    types: PROOF_TYPES,
    primaryType: "SellerRequest" as const,
    message: {
      payTo: payee.payTo as `0x${string}`,
      purpose,
      method: method.toUpperCase(),
      bodyHash: bodyHash as `0x${string}`,
      issuedAt: BigInt(issuedAtSec),
      expiresAt: BigInt(expiresAtSec),
    },
  };
  const signature = await account.signTypedData({
    domain: typedData.domain,
    types: { SellerRequest: PROOF_TYPES.SellerRequest },
    primaryType: "SellerRequest",
    message: typedData.message,
  });
  return base64urlEncode(
    JSON.stringify({
      typedData: {
        ...typedData,
        message: {
          ...typedData.message,
          issuedAt: issuedAtSec,
          expiresAt: expiresAtSec,
        },
      },
      signature,
    }),
  );
}

function base64urlEncode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export const ARC_NETWORK = ARC_MAINNET.network;
