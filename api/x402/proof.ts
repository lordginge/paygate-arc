// Seller proof signing for Circle Facilitator Service.
// A base64url envelope carrying an EIP-712 "SellerRequest" signature that
// proves control of payTo and binds the request purpose and body.
// Reference: developers.circle.com/facilitator-service/quickstart

import { privateKeyToAccount } from "viem/accounts";
import { keccak256, toBytes, toHex } from "viem";
import {
  ARC_CHAIN_ID,
  ARC_NETWORK,
  SELLER_PRIVATE_KEY,
  TREASURY_ADDRESS,
} from "./config";

export async function buildSellerProof(
  purpose: "verify" | "settle" | "status",
  method: string,
  body: string,
): Promise<string> {
  const account = privateKeyToAccount(SELLER_PRIVATE_KEY);
  const nonceBytes = crypto.getRandomValues(new Uint8Array(32));
  const nonce = toHex(nonceBytes);
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + 300;

  const signature = await account.signTypedData({
    domain: {
      name: "Circle Facilitator Seller Request",
      version: "1",
      chainId: ARC_CHAIN_ID,
    },
    types: {
      SellerRequest: [
        { name: "purpose", type: "string" },
        { name: "method", type: "string" },
        { name: "bodyHash", type: "bytes32" },
        { name: "network", type: "string" },
        { name: "payTo", type: "address" },
        { name: "nonce", type: "bytes32" },
        { name: "issuedAt", type: "uint64" },
        { name: "expiresAt", type: "uint64" },
      ],
    },
    primaryType: "SellerRequest",
    message: {
      purpose,
      method: method.toUpperCase(),
      bodyHash: keccak256(toBytes(body)),
      network: ARC_NETWORK,
      payTo: TREASURY_ADDRESS,
      nonce,
      issuedAt: BigInt(issuedAt),
      expiresAt: BigInt(expiresAt),
    },
  });

  const envelope = {
    version: 1,
    signature,
    network: ARC_NETWORK,
    payTo: TREASURY_ADDRESS,
    nonce,
    issuedAt,
    expiresAt,
  };

  return Buffer.from(JSON.stringify(envelope)).toString("base64url");
}
