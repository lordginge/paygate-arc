/**
 * One-time setup for Circle developer-controlled wallets.
 *
 *   npx tsx scripts/setup-circle.ts
 *
 * 1. Generates an entity secret if CIRCLE_ENTITY_SECRET is not already in .env
 * 2. Registers its ciphertext with Circle (recovery file saved to ./recovery —
 *    back it up; Circle never stores the secret itself)
 * 3. Creates the "PayGate Sellers" wallet set and writes CIRCLE_WALLET_SET_ID
 *
 * Requires CIRCLE_API_KEY in .env (server-side only, never commit it).
 */

import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";

async function main() {
  loadEnv();

  const apiKey = process.env.CIRCLE_API_KEY;
  if (!apiKey) {
    throw new Error("CIRCLE_API_KEY missing from .env");
  }

  const sdk = await import("@circle-fin/developer-controlled-wallets");

  // 1. Entity secret
  let entitySecret = process.env.CIRCLE_ENTITY_SECRET;
  if (!entitySecret) {
    entitySecret = randomBytes(32).toString("hex");
    appendFileSync(".env", `\nCIRCLE_ENTITY_SECRET=${entitySecret}\n`);
    console.log("Generated CIRCLE_ENTITY_SECRET and appended it to .env");
  }

  // 2. Register ciphertext (idempotent — Circle accepts re-registration)
  mkdirSync("./recovery", { recursive: true });
  const reg = await sdk.registerEntitySecretCiphertext({
    apiKey,
    entitySecret,
    recoveryFileDownloadPath: "./recovery",
  });
  console.log("Entity secret registered. Recovery file:", reg.recoveryFile ?? "(saved to ./recovery)");
  console.log("Back up the recovery file somewhere safe — losing both it and the secret means permanent loss of funds.");

  // 3. Wallet set
  if (!process.env.CIRCLE_WALLET_SET_ID) {
    const client = sdk.initiateDeveloperControlledWalletsClient({
      apiKey,
      entitySecret,
    });
    const res = await client.createWalletSet({ name: "PayGate Sellers" });
    const id = res.data?.walletSet?.id;
    if (!id) {
      throw new Error("Circle returned no wallet set id");
    }
    appendFileSync(".env", `CIRCLE_WALLET_SET_ID=${id}\n`);
    console.log("Created wallet set 'PayGate Sellers':", id, "(appended to .env)");
  } else {
    console.log("CIRCLE_WALLET_SET_ID already set, skipping wallet set creation.");
  }

  console.log("Done. Set CIRCLE_ENTITY_SECRET and CIRCLE_WALLET_SET_ID as deploy secrets too.");
}

function loadEnv() {
  if (!existsSync(".env")) return;
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2];
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
