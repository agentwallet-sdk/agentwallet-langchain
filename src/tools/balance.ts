import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import type { WalletContext } from "../toolkit.js";
import { checkBudget, NATIVE_TOKEN } from "agentwallet-sdk";
import type { Address } from "viem";

const schema = z.object({
  token: z
    .string()
    .optional()
    .describe(
      "Token symbol (ETH, USDC, WETH) or ERC-20 contract address (0x-prefixed). " +
      "Omit for native token (ETH/SOL)."
    ),
});

/**
 * AgentWalletBalanceTool
 *
 * Checks the current spend budget remaining for the agent's wallet.
 * Returns per-tx limit, remaining period budget, and token address.
 */
export class AgentWalletBalanceTool extends DynamicStructuredTool {
  constructor(ctx: WalletContext) {
    // @ts-ignore — DynamicStructuredTool generic inference depth
    super({
      name: "agent_wallet_balance",
      description:
        "Check the agent wallet's remaining autonomous spend budget. " +
        "Returns how much the agent can spend per transaction and in the current period " +
        "without requiring owner approval.",
      schema,
      func: async (input: z.infer<typeof schema>) => {
        try {
          const tokenAddr = ctx.resolveToken(input.token) ?? (NATIVE_TOKEN as Address);
          const budget = await checkBudget(ctx.wallet, tokenAddr);
          return JSON.stringify({
            token: input.token ?? "native",
            perTxLimit: budget.perTxLimit.toString(),
            remainingInPeriod: budget.remainingInPeriod.toString(),
            note: "Amounts are in the token's smallest unit (wei for ETH, 6 decimals for USDC).",
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          return `Error checking balance: ${msg}`;
        }
      },
    });
  }
}
