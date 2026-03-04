# agentwallet-langchain

A LangChain toolkit that gives agents a non-custodial wallet. Five `StructuredTool`s for checking balances, sending tokens, swapping, bridging cross-chain, and paying x402 endpoints — all backed by [agentwallet-sdk](https://www.npmjs.com/package/agentwallet-sdk).

Works with LangGraph out of the box. No Coinbase CDP required.

## Install

```bash
npm install agentwallet-langchain agentwallet-sdk @langchain/core
```

## Quick start

```typescript
import { AgentWalletToolkit } from "agentwallet-langchain";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";

const toolkit = new AgentWalletToolkit({
  privateKey: process.env.AGENT_PRIVATE_KEY!,
  accountAddress: "0x...",  // your deployed AgentAccountV2 contract
  chain: "base",
});

const agent = createReactAgent({
  llm: new ChatOpenAI({ model: "gpt-4o" }),
  tools: toolkit.getTools(),
});

const result = await agent.invoke({
  messages: [{ role: "user", content: "Check my USDC balance and send 5 USDC to 0x..." }],
});
```

## Tools

| Tool name | What it does |
|-----------|-------------|
| `agent_wallet_balance` | Check remaining autonomous spend budget (per-tx and period limits) |
| `agent_wallet_transfer` | Send ERC-20 or native ETH — queues for owner approval if over limit |
| `agent_wallet_swap` | Swap tokens via SmartSwapRouter (Uniswap V3 routing on Base) |
| `agent_wallet_bridge` | Move USDC cross-chain via CCTP V2 (17 chains, 2–20 min finality) |
| `agent_wallet_x402_pay` | Pay HTTP 402 endpoints via x402 micropayments |

## Using individual tools

You can import tools directly if you only need some of them:

```typescript
import {
  AgentWalletBalanceTool,
  AgentWalletTransferTool,
  AgentWalletX402Tool,
} from "agentwallet-langchain";
```

Each tool takes a `WalletContext` from the toolkit. Use `AgentWalletToolkit` to create it, then extract the tools you need:

```typescript
const toolkit = new AgentWalletToolkit({ privateKey, accountAddress, chain: "base" });
const [balance, transfer, , , x402] = toolkit.getTools();
```

## Spend limits

The smart contract enforces spend limits at the EVM level — not just in software. If an agent tries to spend more than the configured per-tx or period cap, the transaction gets **queued for owner approval** instead of reverting.

The `agent_wallet_transfer` tool tells the agent clearly when a transaction was queued vs executed, so it can communicate this back to the user:

```json
{ "status": "queued", "message": "Transfer exceeded spend limit and is queued for owner approval.", "txHash": "0x..." }
```

## Supported chains

| Chain | ID | Support |
|-------|----|---------|
| Base | 8453 | Full (swap + bridge + x402) |
| Ethereum | 1 | Full |
| Arbitrum | 42161 | Full |
| Optimism | 10 | Full |
| Polygon | 137 | Full |
| Base Sepolia | 84532 | Testnet |
| Solana | — | Bridge only (via CCTP V2) |

## Config

```typescript
interface AgentWalletToolkitConfig {
  privateKey: string;       // Agent's 0x-prefixed private key
  accountAddress: string;   // Deployed AgentAccountV2 contract address
  chain?: string;           // Default: "base"
  rpcUrl?: string;          // Custom RPC (optional)
  tokenMap?: Record<string, `0x${string}`>;  // Custom token symbols
}
```

## LangGraph example

```typescript
import { StateGraph, MessagesAnnotation } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { AgentWalletToolkit } from "agentwallet-langchain";

const toolkit = new AgentWalletToolkit({ privateKey, accountAddress, chain: "base" });
const tools = toolkit.getTools();
const toolNode = new ToolNode(tools);

const graph = new StateGraph(MessagesAnnotation)
  .addNode("agent", callModel)
  .addNode("tools", toolNode)
  .addEdge("__start__", "agent")
  .addConditionalEdges("agent", shouldContinue)
  .addEdge("tools", "agent");
```

## Running tests

```bash
npm install
npm test
```

Tests use mocked SDK and viem calls — no live RPC needed.

## Related

- [agentwallet-sdk](https://www.npmjs.com/package/agentwallet-sdk) — core TypeScript SDK
- [agentwallet-crewai-tool](https://pypi.org/project/agentwallet-crewai-tool/) — CrewAI Python tools
- [elizaos-plugin-agentwallet](https://www.npmjs.com/package/elizaos-plugin-agentwallet) — ElizaOS plugin

## License

MIT
