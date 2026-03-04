/**
 * agentwallet-langchain
 * =====================
 * Non-custodial wallet toolkit for LangChain/LangGraph agents.
 *
 * Quick start:
 *   import { AgentWalletToolkit } from "agentwallet-langchain";
 *
 *   const toolkit = new AgentWalletToolkit({
 *     privateKey: process.env.AGENT_KEY!,
 *     accountAddress: "0x...",
 *     chain: "base",
 *   });
 *
 *   const tools = toolkit.getTools();
 *   // Use tools with createReactAgent, LangGraph, etc.
 */

export { AgentWalletToolkit } from "./toolkit.js";
export type { AgentWalletToolkitConfig, WalletContext } from "./toolkit.js";

export { AgentWalletBalanceTool } from "./tools/balance.js";
export { AgentWalletTransferTool } from "./tools/transfer.js";
export { AgentWalletSwapTool } from "./tools/swap.js";
export { AgentWalletBridgeTool } from "./tools/bridge.js";
export { AgentWalletX402Tool } from "./tools/x402.js";
