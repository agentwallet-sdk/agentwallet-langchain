import { DynamicStructuredTool } from "@langchain/core/tools";
import { createWalletClient, http, zeroAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, baseSepolia, mainnet, arbitrum, optimism, polygon } from "viem/chains";
import { createWallet, NATIVE_TOKEN } from "agentwallet-sdk";
import type { Address, Chain } from "viem";

import { AgentWalletBalanceTool } from "./tools/balance.js";
import { AgentWalletTransferTool } from "./tools/transfer.js";
import { AgentWalletSwapTool } from "./tools/swap.js";
import { AgentWalletBridgeTool } from "./tools/bridge.js";
import { AgentWalletX402Tool } from "./tools/x402.js";

// ─── Chain registry ───────────────────────────────────────────────────────────

const CHAIN_MAP: Record<string, Chain> = {
  base,
  "base-sepolia": baseSepolia,
  ethereum: mainnet,
  arbitrum,
  optimism,
  polygon,
};

// Token symbol → Base mainnet address (extend as needed)
const BASE_SYMBOL_MAP: Record<string, Address> = {
  USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  USDT: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
  WETH: "0x4200000000000000000000000000000000000006",
  DAI: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb",
};

// ─── WalletContext ────────────────────────────────────────────────────────────

/**
 * Shared context passed to all tools. Contains the initialized wallet,
 * chain name, and helpers used by each tool's _call method.
 */
export interface WalletContext {
  wallet: ReturnType<typeof createWallet>;
  chain: string;
  rpcUrl: string | undefined;
  /** Resolve a token symbol or address to a checksummed address, or null for native. */
  resolveToken(symbolOrAddress?: string): Address | null;
}

// ─── AgentWalletToolkit ───────────────────────────────────────────────────────

export interface AgentWalletToolkitConfig {
  /** Agent's private key (0x-prefixed hex). */
  privateKey: string;
  /** Deployed AgentAccountV2 contract address. */
  accountAddress: string;
  /**
   * Chain name: 'base' | 'ethereum' | 'arbitrum' | 'optimism' | 'polygon' | 'base-sepolia'.
   * Default: 'base'.
   */
  chain?: string;
  /** Custom RPC URL. Falls back to the chain's default public RPC if omitted. */
  rpcUrl?: string;
  /**
   * Optional token symbol → address map for chains other than Base,
   * or to add custom tokens. Merged with the built-in Base token list.
   */
  tokenMap?: Record<string, Address>;
}

/**
 * AgentWalletToolkit
 *
 * Bundles five LangChain StructuredTools that give an agent a non-custodial wallet.
 * All tools share a single wallet instance and spend-limit enforcement.
 *
 * Usage:
 * ```ts
 * const toolkit = new AgentWalletToolkit({
 *   privateKey: process.env.AGENT_PRIVATE_KEY!,
 *   accountAddress: "0x...",
 *   chain: "base",
 * });
 *
 * const tools = toolkit.getTools();
 * // Pass `tools` to your LangChain agent or LangGraph node
 * ```
 */
export class AgentWalletToolkit {
  private ctx: WalletContext;

  constructor(config: AgentWalletToolkitConfig) {
    const chainName = config.chain ?? "base";
    const viemChain = CHAIN_MAP[chainName];
    if (!viemChain) {
      throw new Error(
        `Unsupported chain: "${chainName}". ` +
        `Supported: ${Object.keys(CHAIN_MAP).join(", ")}`
      );
    }

    const account = privateKeyToAccount(config.privateKey as `0x${string}`);
    const walletClient = createWalletClient({
      account,
      chain: viemChain,
      transport: http(config.rpcUrl),
    });

    const wallet = createWallet({
      accountAddress: config.accountAddress as Address,
      chain: chainName,
      rpcUrl: config.rpcUrl,
      walletClient,
    });

    // Merge built-in token map with any custom entries
    const tokenMap: Record<string, Address> = {
      ...BASE_SYMBOL_MAP,
      ...(config.tokenMap ?? {}),
    };

    this.ctx = {
      wallet,
      chain: chainName,
      rpcUrl: config.rpcUrl,
      resolveToken(symbolOrAddress?: string): Address | null {
        if (!symbolOrAddress) return null;
        if (symbolOrAddress.startsWith("0x")) return symbolOrAddress as Address;
        const upper = symbolOrAddress.toUpperCase();
        if (upper === "ETH" || upper === "SOL") return null; // native
        return tokenMap[upper] ?? null;
      },
    };
  }

  /**
   * Returns all five wallet tools ready to pass to a LangChain agent.
   *
   * Tools:
   * - agent_wallet_balance  — check spend budget
   * - agent_wallet_transfer — send tokens
   * - agent_wallet_swap     — swap via SmartSwapRouter
   * - agent_wallet_bridge   — cross-chain USDC via CCTP V2
   * - agent_wallet_x402_pay — x402 micropayments
   */
  getTools(): DynamicStructuredTool[] {
    return [
      new AgentWalletBalanceTool(this.ctx),
      new AgentWalletTransferTool(this.ctx),
      new AgentWalletSwapTool(this.ctx),
      new AgentWalletBridgeTool(this.ctx),
      new AgentWalletX402Tool(this.ctx),
    ];
  }
}
