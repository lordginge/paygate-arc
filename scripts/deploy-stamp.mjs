// Deploy + genesis stamp for PayGateStamp on Arc (testnet or mainnet).
// Flow: deploy (owner = ephemeral deployer) -> setStamper(deployer) -> genesis
// stamp -> transferOwnership(TREASURY). The deployer stays stamper until the
// real STAMP_PRIVATE_KEY exists and the owner revokes the ephemeral one.
// Usage: STAMP_NET=testnet|mainnet node scripts/deploy-stamp.mjs
import { createWalletClient, createPublicClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync } from "fs";

const NET = process.env.STAMP_NET ?? "testnet";
const RPC = NET === "mainnet" ? "https://rpc.mainnet.arc.io" : "https://rpc.testnet.arc.io";
const TREASURY = "0x57607f9296385571CbD8Df14D8728B7CB839743D";
const BUILD = new URL("../../.stamp-build/", import.meta.url).pathname;
const { pk } = JSON.parse(readFileSync(BUILD + "deployer.json", "utf8"));
const { abi, bin } = JSON.parse(readFileSync(BUILD + "stamp.json", "utf8"));
const account = privateKeyToAccount(pk);
const pub = createPublicClient({ transport: http(RPC) });
const wallet = createWalletClient({ account, transport: http(RPC) });

const chainId = await pub.getChainId();
const bal = await pub.getBalance({ address: account.address });
console.log(`net=${NET} chainId=${chainId} deployer=${account.address} balance=${Number(bal) / 1e18}`);
if (bal === 0n) { console.log("UNFUNDED — send gas USDC first"); process.exit(1); }

const deployTx = await wallet.deployContract({ abi, bytecode: "0x" + bin });
const rcpt = await pub.waitForTransactionReceipt({ hash: deployTx });
const addr = rcpt.contractAddress;
console.log(`DEPLOYED contract=${addr} tx=${deployTx} gasUsed=${rcpt.gasUsed}`);

const adminAbi = parseAbi([
  "function setStamper(address stamper, bool allowed)",
  "function transferOwnership(address newOwner)",
  "function stamp(bytes32 paymentId, bytes32 termsHash, address buyer, address seller, bytes32 buyerRef)",
]);

const tx1 = await wallet.writeContract({ address: addr, abi: adminAbi, functionName: "setStamper", args: [account.address, true] });
await pub.waitForTransactionReceipt({ hash: tx1 });
console.log(`STAMPER SET tx=${tx1}`);

const paymentId = "0x" + Buffer.from("paygate-genesis-stamp-v1").toString("hex").padEnd(64, "0");
const termsHash = "0x" + Buffer.from("find-and-fill-v2-proposal").toString("hex").padEnd(64, "0");
const stampTx = await wallet.writeContract({
  address: addr, abi: adminAbi, functionName: "stamp",
  args: [paymentId, termsHash, account.address, account.address, "0x" + "0".repeat(64)],
});
const sRcpt = await pub.waitForTransactionReceipt({ hash: stampTx });
console.log(`GENESIS STAMP tx=${stampTx} block=${sRcpt.blockNumber} status=${sRcpt.status}`);

const tx3 = await wallet.writeContract({ address: addr, abi: adminAbi, functionName: "transferOwnership", args: [TREASURY] });
await pub.waitForTransactionReceipt({ hash: tx3 });
console.log(`OWNERSHIP -> treasury ${TREASURY} tx=${tx3}`);
console.log("DONE. Ephemeral key remains stamper until revoked by owner.");
