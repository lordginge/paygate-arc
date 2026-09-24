import { keccak256, toBytes } from "viem";
import { arcRpc, USDC_ADDRESS, USDC_DECIMALS } from "../x402/config";
import { sbSelect, sbUpsert } from "./supabase";