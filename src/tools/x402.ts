import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import type { WalletContext } from "../toolkit.js";
import { createX402Client } from "agentwallet-sdk";

const schema = z.object({
  url: z
    .string()
    .url()
    .describe("The HTTP endpoint that uses x402 payment (returns 402 when payment is needed)."),
  maxAmountUsdc: z
    .string()
    .describe("Maximum USDC to spend on this request, e.g. '0.01' for 1 cent."),
  method: z
    .enum(["GET", "POST", "PUT", "PATCH", "DELETE"])
    .optional()
    .describe("HTTP method. Default: GET."),
  body: z
    .string()
    .optional()
    .describe("Request body as a JSON string (for POST/PUT/PATCH)."),
  headers: z
    .record(z.string())
    .optional()
    .describe("Additional HTTP headers."),
});

/**
 * AgentWalletX402Tool
 *
 * Pays HTTP 402 endpoints using the x402 micropayment protocol.
 * Handles the full 402 → pay → retry flow automatically.
 */
export class AgentWalletX402Tool extends DynamicStructuredTool {
  constructor(ctx: WalletContext) {
    // @ts-ignore — DynamicStructuredTool generic inference depth
    super({
      name: "agent_wallet_x402_pay",
      description:
        "Access HTTP APIs that require micropayments via the x402 protocol. " +
        "When a server returns HTTP 402 Payment Required, this tool pays the USDC " +
        "amount and retries automatically. " +
        "Use this for paid AI APIs, premium data feeds, and agent-to-agent service calls.",
      schema,
      func: async (input: z.infer<typeof schema>) => {
        try {
          const client = createX402Client({
            wallet: ctx.wallet,
            maxBudgetUsdc: input.maxAmountUsdc,
          });

          const response = await client.fetch(input.url, {
            method: input.method ?? "GET",
            headers: input.headers,
            body: input.body ?? undefined,
          });

          const text = await response.text();
          const wasPaid = (client as any).lastPayment != null;
          const amountPaid = (client as any).lastPayment?.amount?.toString() ?? "0";

          return JSON.stringify({
            status: response.status,
            paid: wasPaid,
            amountPaidUsdc: wasPaid ? amountPaid : null,
            body: text.slice(0, 2000),
            truncated: text.length > 2000,
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          return `Error making x402 request: ${msg}`;
        }
      },
    });
  }
}
