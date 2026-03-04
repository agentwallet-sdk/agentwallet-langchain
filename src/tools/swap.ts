import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import type { WalletContext } from "../toolkit.js";
import { SmartSwapRouter, NATIVE_TOKEN } from "agentwallet-sdk";
import { parseUnits, formatUnits } from "viem";

const schema = z.object({
  tokenIn: z.string().describe("Token to sell — symbol (ETH, USDC, WETH) or contract address."),
  tokenOut: z.string().describe("Token to buy — symbol or contract address."),
  amountIn: z
    .string()
    .describe("Amount to sell as a decimal string, e.g. '100' for 100 USDC."),
  slippageBps: z
    .number()
    .optional()
    .describe("Max slippage in basis points (100 = 1%). Default: 50 (0.5%)."),
  decimalsIn: z
    .number()
    .optional()
    .describe("Decimals of tokenIn (default: 18 for ETH, 6 for USDC)."),
  strategy: z
    .enum(["best-net-output", "fastest", "lowest-gas", "mev-protected"])
    .optional()
    .describe("Routing strategy. Default: best-net-output."),
});

/**
 * AgentWalletSwapTool
 *
 * Gets quotes from multiple DEX aggregators (1inch, 0x, Uniswap, etc.) and executes
 * the best route. Supports MEV-protected swaps via CowSwap/Flashbots.
 */
export class AgentWalletSwapTool extends DynamicStructuredTool {
  constructor(ctx: WalletContext) {
    // @ts-ignore — DynamicStructuredTool generic inference depth
    super({
      name: "agent_wallet_swap",
      description:
        "Swap tokens on-chain via SmartSwapRouter. " +
        "Gets quotes from multiple DEX aggregators and picks the best rate. " +
        "Supports Uniswap, 1inch, 0x, and more. " +
        "Slippage defaults to 0.5% (50 bps).",
      schema,
      func: async (input: z.infer<typeof schema>) => {
        try {
          const router = new SmartSwapRouter({
            strategy: input.strategy ?? "best-net-output",
            slippageBps: input.slippageBps ?? 50,
          });

          const inAddr = ctx.resolveToken(input.tokenIn) ?? NATIVE_TOKEN;
          const outAddr = ctx.resolveToken(input.tokenOut) ?? NATIVE_TOKEN;
          const decimalsIn = input.decimalsIn ?? (input.tokenIn?.toUpperCase() === "USDC" ? 6 : 18);
          const amountIn = parseUnits(input.amountIn, decimalsIn);

          // Get quotes then execute the best
          const quotes = await router.getQuotes({
            fromToken: inAddr,
            toToken: outAddr,
            fromAmount: amountIn,
            chain: ctx.chain,
          });

          if (!quotes.length) {
            return "No swap routes found for this pair.";
          }

          const best = quotes[0];

          // Build a minimal wallet adapter for executeSwap
          const walletAdapter = {
            sendTransaction: async (tx: {
              to: string;
              data: string;
              value: bigint;
              gasLimit: bigint;
            }) => {
              const hash = await ctx.wallet.walletClient.sendTransaction({
                to: tx.to as `0x${string}`,
                data: tx.data as `0x${string}`,
                value: tx.value,
                gas: tx.gasLimit,
                chain: ctx.wallet.chain,
                account: ctx.wallet.walletClient.account!,
              });
              return hash;
            },
          };

          const result = await router.executeSwap(best, walletAdapter as any);

          return JSON.stringify({
            status: "executed",
            txHash: result.txHash,
            provider: result.quote.provider,
            amountOut: result.quote.toAmount.toString(),
            tokenOut: input.tokenOut,
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          return `Error executing swap: ${msg}`;
        }
      },
    });
  }
}
