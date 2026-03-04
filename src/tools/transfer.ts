import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import type { WalletContext } from "../toolkit.js";
import { agentExecute, agentTransferToken, NATIVE_TOKEN } from "agentwallet-sdk";
import { parseUnits } from "viem";
import type { Address } from "viem";

const schema = z.object({
  to: z.string().describe("Recipient address (0x-prefixed hex)."),
  amount: z
    .string()
    .describe("Amount to send as a decimal string, e.g. '1.5' for 1.5 USDC or '0.001' for 0.001 ETH."),
  token: z
    .string()
    .optional()
    .describe("Token symbol or ERC-20 contract address. Omit to send native ETH."),
  decimals: z
    .number()
    .optional()
    .describe("Token decimals (default: 18 for ETH, 6 for USDC). Only needed for unusual tokens."),
});

/**
 * AgentWalletTransferTool
 *
 * Sends ERC-20 tokens or native ETH from the agent's non-custodial wallet.
 * Respects spend limits — over-limit transactions are queued for owner approval.
 */
export class AgentWalletTransferTool extends DynamicStructuredTool {
  constructor(ctx: WalletContext) {
    // @ts-ignore — DynamicStructuredTool generic inference depth
    super({
      name: "agent_wallet_transfer",
      description:
        "Send ERC-20 tokens or native ETH from the agent's non-custodial wallet. " +
        "Transactions within spend limits execute immediately. " +
        "Transactions over the limit are queued for owner approval — the agent gets " +
        "a pending TX ID to share with the user.",
      schema,
      func: async (input: z.infer<typeof schema>) => {
        try {
          const tokenAddr = ctx.resolveToken(input.token);
          const decimals = input.decimals ?? (input.token?.toUpperCase() === "USDC" ? 6 : 18);
          const amount = parseUnits(input.amount, decimals);

          if (tokenAddr && tokenAddr !== NATIVE_TOKEN) {
            const hash = await agentTransferToken(ctx.wallet, {
              token: tokenAddr as Address,
              to: input.to as Address,
              amount,
            });
            return JSON.stringify({ status: "executed", txHash: hash });
          } else {
            const result = await agentExecute(ctx.wallet, {
              to: input.to as Address,
              value: amount,
            });
            if (!result.executed) {
              return JSON.stringify({
                status: "queued",
                message: "Transfer exceeded spend limit and is queued for owner approval.",
                txHash: result.txHash,
              });
            }
            return JSON.stringify({ status: "executed", txHash: result.txHash });
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          return `Error sending transfer: ${msg}`;
        }
      },
    });
  }
}
