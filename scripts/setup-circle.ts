// One-time Circle Wallets setup for PayGate.
// 1. Generates + registers an entity secret if CIRCLE_ENTITY_SECRET is unset
//    (recovery file saved to ./recovery — store it somewhere safe).
// 2. Creates the platform wallet set and prints its ID.
// Run: npx tsx scripts/setup-circle.ts

import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import {
  initiateDeveloperControlledWalletsClient,
  registerEntitySecretCiphertext,
} from "@circle-fin/developer-controlled-wallets";

const apiKey = process.env.CIRCLE_API_KEY;
if (!apiKey) throw new Error("CIRCLE_API_KEY is required (set it in .env)");

// --- Step 1: entity secret ---
let entitySecret = process.env.CIRCLE_ENTITY_SECRET;
if (!entitySecret) {
  entitySecret = randomBytes(32).toString("hex");
  mkdirSync("./recovery", { recursive: true });
  await registerEntitySecretCiphertext({
    apiKey,
    entitySecret,
    recoveryFileDownloadPath: "./recovery",
  });
  appendFileSync(".env", `\nCIRCLE_ENTITY_SECRET=${entitySecret}\n`);
  console.log(
    "Entity secret registered. Recovery file saved under ./recovery — back it up now.",
  );
} else {
  console.log("CIRCLE_ENTITY_SECRET already set, skipping registration.");
}

// --- Step 2: wallet set ---
const client = initiateDeveloperControlledWalletsClient({ apiKey, entitySecret });

const existing = process.env.CIRCLE_WALLET_SET_ID;
if (existing) {
  console.log("CIRCLE_WALLET_SET_ID already set:", existing);
} else {
  const res = await client.createWalletSet({ name: "PayGate Sellers" });
  const id = res.data?.walletSet?.id;
  if (!id) throw new Error("Wallet set creation failed");
  appendFileSync(".env", `\nCIRCLE_WALLET_SET_ID=${id}\n`);
  console.log("Wallet set created:", id);
  console.log("CIRCLE_WALLET_SET_ID added to .env");
}
