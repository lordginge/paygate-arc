// Seller proof signing for Circle Facilitator Service.
// A base64url envelope carrying an EIP-712 "SellerRequest" signature that
// proves control of payTo and binds the request purpose and body.
// Reference: developers.circle.com/facilitator-service/quickstart
//
// Two signing paths:
//  - seller has a Circle developer-controlled wallet -> sign via Circle's
//    Sign API (no private key in this codebase)
//  - otherwise -> platform treasury key from env (v1 behaviour)

import { privateKeyToAccount } from "viem/accounts";
import { keccak256, toBytes, toHex } from "viem";
import { ARC_CHAIN_ID, ARC_NETWORK, SELLER_PRIVATE_KEY } from "./config";
import { signSellerTypedData } from "../circle/wallets";

export interface Payee {
  payTo: string;
  circleWalletId?: string | null;
}

export async function buildSellerProof(
  purpose: "verify" | "settle" | "status",
  method: string,
  body: string,
  payee: Payee,
): Promise<string> {
  const nonceBytes = crypto.getRandomValues(new Uint8Array(32));
  const nonce = toHex(nonceBytes);
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + 300;

  const typedData = {
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
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
      ],
    },
    primaryType: "SellerRequest",
    message: {
      purpose,
      method: method.toUpperCase(),
      bodyHash: keccak256(toBytes(body)),
      network: ARC_NETWORK,
      payTo: payee.payTo,
      nonce,
      issuedAt: issuedAt,
      expiresAt: expiresAt,
    },
  };

  let signature: string;
  if (payee.circleWalletId) {
    signature = await signSellerTypedData(payee.circleWalletId, typedData);
  } else {
    const account = privateKeyToAccount(SELLER_PRIVATE_KEY);
    signature = await account.signTypedData({
      domain: typedData.domain,
      types: { SellerRequest: typedData.types.SellerRequest },
      primaryType: "SellerRequest",
      message: {
        ...typedData.message,
        issuedAt: BigInt(issuedAt),
        expiresAt: BigInt(expiresAt),
        payTo: payee.payTo as `0x${string}`,
      },
    });
  }

  const envelope = {
    version: 1,
    signature,
    network: ARC_NETWORK,
    payTo: payee.payTo,
    nonce,
    issuedAt,
    expiresAt,
  };

  return Buffer.from(JSON.stringify(envelope)).toString("base64url");
}
