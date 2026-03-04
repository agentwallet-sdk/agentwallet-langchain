import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import type { WalletContext } from "../toolkit.js";
import { createBridge } from "agentwallet-sdk";
import { parseUnits } from "viem";
import type { Address } from "viem";

const schema = z.object({
  destinationChain: z
    .string()
    .describe(
      "Target chain: 'ethereum', 'arbitrum', 'optimism', 'polygon', 'base', 'solana', " +
      "or any CCTP V2 supported chain."
    ),
  amountUsdc: z
    .string()
    .describe("USDC amount to bridge as a decimal string, e.g. '50' for $50."),
  recipient: z
    .string()
    .optional()
    .describe("Recipient address on the destination chain. Defaults to the agent's own address."),
});

/**
 * AgentWalletBridgeTool
 *
 * Transfers USDC cross-chain via Circle's CCTP V2 (17 chains, 2–20 min finality).
 */
export class AgentWalletBridgeTool extends DynamicStructuredTool {
  constructor(ctx: WalletContext) {
    // @ts-ignore — DynamicStructuredTool generic inference depth
    super({
      name: "agent_wallet_bridge",
      description:
        "Move USDC cross-chain via Circle's CCTP V2 protocol. " +
        "Supports 17 chains including Ethereum, Arbitrum, Optimism, Polygon, Base, and Solana. " +
        "Funds arrive in 2–20 minutes. Returns the burn TX and an attestation URL.",
      schema,
      func: async (input: z.infer<typeof schema>) => {
        try {
          const bridge = await createBridge({
            sourceChain: ctx.chain,
            walletClient: ctx.wallet.walletClient,
            rpcUrl: ctx.rpcUrl,
          });

          const amountUsdc = parseUnits(input.amountUsdc, 6);
          const recipient = (input.recipient ?? ctx.wallet.walletClient.account?.address) as Address;

          const result = await bridge.bridge({
            destinationChain: input.destinationChain,
            amountUsdc,
            recipient,
          });

          return JSON.stringify({
            status: "initiated",
            burnTxHash: result.burnTxHash,
            estimatedSeconds: result.estimatedSeconds,
            attestationUrl: result.attestationUrl,
            note: `USDC will arrive on ${input.destinationChain} at ${recipient}.`,
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          return `Error initiating bridge: ${msg}`;
        }
      },
    });
  }
}
