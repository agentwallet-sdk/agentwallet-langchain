/**
 * Tests for agentwallet-langchain tools.
 *
 * All SDK and viem calls are mocked — no live RPC or on-chain access needed.
 * Tests verify: tool names, descriptions, schemas, invoke behavior, error handling.
 */

import { AgentWalletBalanceTool } from "../src/tools/balance";
import { AgentWalletTransferTool } from "../src/tools/transfer";
import { AgentWalletSwapTool } from "../src/tools/swap";
import { AgentWalletBridgeTool } from "../src/tools/bridge";
import { AgentWalletX402Tool } from "../src/tools/x402";
import {
  checkBudget,
  agentExecute,
  agentTransferToken,
  createBridge,
  createX402Client,
  SmartSwapRouter,
} from "agentwallet-sdk";

// ─── Shared mock context ──────────────────────────────────────────────────────

const mockWallet = {
  address: "0xWalletAddress",
  walletClient: { account: { address: "0xAgentAddress" } },
  publicClient: {},
  contract: {},
  chain: { id: 8453, name: "base" },
} as any;

const mockCtx = {
  wallet: mockWallet,
  chain: "base",
  rpcUrl: undefined,
  resolveToken(sym?: string) {
    if (!sym) return null;
    if (sym.startsWith("0x")) return sym as any;
    if (sym.toUpperCase() === "USDC") return "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as any;
    if (sym.toUpperCase() === "ETH") return null;
    return null;
  },
};

// ─── AgentWalletBalanceTool ───────────────────────────────────────────────────

describe("AgentWalletBalanceTool", () => {
  let tool: AgentWalletBalanceTool;

  beforeEach(() => {
    jest.clearAllMocks();
    tool = new AgentWalletBalanceTool(mockCtx);
  });

  test("has correct name", () => {
    expect(tool.name).toBe("agent_wallet_balance");
  });

  test("has a non-empty description", () => {
    expect(tool.description.length).toBeGreaterThan(20);
  });

  test("schema allows empty input (token optional)", () => {
    const parsed = (tool.schema as any).safeParse({});
    expect(parsed.success).toBe(true);
  });

  test("invoke returns balance JSON on success", async () => {
    const result = await tool.invoke({});
    const parsed = JSON.parse(result as string);
    expect(parsed).toHaveProperty("perTxLimit");
    expect(parsed).toHaveProperty("remainingInPeriod");
    expect(checkBudget).toHaveBeenCalledTimes(1);
  });

  test("invoke passes USDC token address to checkBudget", async () => {
    await tool.invoke({ token: "USDC" });
    expect(checkBudget).toHaveBeenCalledWith(
      mockWallet,
      "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
    );
  });

  test("invoke returns error string on failure", async () => {
    (checkBudget as jest.Mock).mockRejectedValueOnce(new Error("RPC down"));
    const result = await tool.invoke({});
    expect(result as string).toContain("Error checking balance");
  });
});

// ─── AgentWalletTransferTool ──────────────────────────────────────────────────

describe("AgentWalletTransferTool", () => {
  let tool: AgentWalletTransferTool;

  beforeEach(() => {
    jest.clearAllMocks();
    tool = new AgentWalletTransferTool(mockCtx);
  });

  test("has correct name", () => {
    expect(tool.name).toBe("agent_wallet_transfer");
  });

  test("schema requires 'to' and 'amount'", () => {
    const bad = (tool.schema as any).safeParse({ amount: "1" });
    expect(bad.success).toBe(false);
  });

  test("invoke executes native ETH transfer via agentExecute", async () => {
    const result = await tool.invoke({ to: "0xRecipient", amount: "0.01" });
    const parsed = JSON.parse(result as string);
    expect(parsed.status).toBe("executed");
    expect(parsed.txHash).toBe("0xmockTxHash");
    expect(agentExecute).toHaveBeenCalledTimes(1);
  });

  test("invoke executes ERC-20 transfer via agentTransferToken", async () => {
    const result = await tool.invoke({ to: "0xRecipient", amount: "50", token: "USDC" });
    expect(agentTransferToken).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(result as string);
    expect(parsed.status).toBe("executed");
  });

  test("invoke reports queued when agentExecute returns executed=false", async () => {
    (agentExecute as jest.Mock).mockResolvedValueOnce({ executed: false, txHash: "0xQ" });
    const result = await tool.invoke({ to: "0xRecipient", amount: "9999" });
    const parsed = JSON.parse(result as string);
    expect(parsed.status).toBe("queued");
  });

  test("invoke returns error string on failure", async () => {
    (agentExecute as jest.Mock).mockRejectedValueOnce(new Error("Revert"));
    const result = await tool.invoke({ to: "0xRecipient", amount: "1" });
    expect(result as string).toContain("Error sending transfer");
  });
});

// ─── AgentWalletSwapTool ──────────────────────────────────────────────────────

describe("AgentWalletSwapTool", () => {
  let tool: AgentWalletSwapTool;

  beforeEach(() => {
    jest.clearAllMocks();
    tool = new AgentWalletSwapTool(mockCtx);
  });

  test("has correct name", () => {
    expect(tool.name).toBe("agent_wallet_swap");
  });

  test("schema requires tokenIn, tokenOut, amountIn", () => {
    const bad = (tool.schema as any).safeParse({ tokenIn: "ETH" });
    expect(bad.success).toBe(false);
  });

  test("invoke executes swap and returns txHash + amountOut", async () => {
    const result = await tool.invoke({ tokenIn: "ETH", tokenOut: "USDC", amountIn: "0.05" });
    const parsed = JSON.parse(result as string);
    expect(parsed.status).toBe("executed");
    expect(parsed.txHash).toBe("0xmockSwapHash");
  });

  test("invoke returns provider info in successful swap", async () => {
    const result = await tool.invoke({ tokenIn: "ETH", tokenOut: "USDC", amountIn: "1" });
    const parsed = JSON.parse(result as string);
    expect(parsed.provider).toBe("uniswap");
    expect(parsed.tokenOut).toBe("USDC");
  });
});

// ─── AgentWalletBridgeTool ────────────────────────────────────────────────────

describe("AgentWalletBridgeTool", () => {
  let tool: AgentWalletBridgeTool;

  beforeEach(() => {
    jest.clearAllMocks();
    tool = new AgentWalletBridgeTool(mockCtx);
  });

  test("has correct name", () => {
    expect(tool.name).toBe("agent_wallet_bridge");
  });

  test("schema requires destinationChain and amountUsdc", () => {
    const bad = (tool.schema as any).safeParse({ destinationChain: "arbitrum" });
    expect(bad.success).toBe(false);
  });

  test("invoke bridges and returns burnTxHash + estimatedSeconds", async () => {
    const result = await tool.invoke({ destinationChain: "arbitrum", amountUsdc: "50" });
    const parsed = JSON.parse(result as string);
    expect(parsed.status).toBe("initiated");
    expect(parsed.burnTxHash).toBe("0xmockBurnHash");
    expect(parsed.estimatedSeconds).toBe(300);
  });

  test("invoke returns error string on failure", async () => {
    (createBridge as jest.Mock).mockRejectedValueOnce(new Error("CCTP unavailable"));
    const result = await tool.invoke({ destinationChain: "optimism", amountUsdc: "10" });
    expect(result as string).toContain("Error initiating bridge");
  });
});

// ─── AgentWalletX402Tool ──────────────────────────────────────────────────────

describe("AgentWalletX402Tool", () => {
  let tool: AgentWalletX402Tool;

  beforeEach(() => {
    jest.clearAllMocks();
    tool = new AgentWalletX402Tool(mockCtx);
  });

  test("has correct name", () => {
    expect(tool.name).toBe("agent_wallet_x402_pay");
  });

  test("schema requires url and maxAmountUsdc", () => {
    const bad = (tool.schema as any).safeParse({ url: "https://example.com" });
    expect(bad.success).toBe(false);
  });

  test("schema rejects non-URL strings", () => {
    const bad = (tool.schema as any).safeParse({ url: "not-a-url", maxAmountUsdc: "0.01" });
    expect(bad.success).toBe(false);
  });

  test("invoke makes x402 request and returns response body", async () => {
    const result = await tool.invoke({
      url: "https://api.example.com/data",
      maxAmountUsdc: "0.01",
    });
    const parsed = JSON.parse(result as string);
    expect(parsed.status).toBe(200);
    expect(parsed.paid).toBe(true);
    expect(parsed.body).toContain("premium content");
  });

  test("invoke returns error string on failure", async () => {
    (createX402Client as jest.Mock).mockReturnValueOnce({
      fetch: jest.fn().mockRejectedValue(new Error("Budget exceeded")),
      lastPayment: null,
    });
    const result = await tool.invoke({ url: "https://example.com", maxAmountUsdc: "0.001" });
    expect(result as string).toContain("Error making x402 request");
  });
});

// ─── AgentWalletToolkit integration ──────────────────────────────────────────

describe("Tool metadata", () => {
  test("all tools have unique names", () => {
    const tools = [
      new AgentWalletBalanceTool(mockCtx),
      new AgentWalletTransferTool(mockCtx),
      new AgentWalletSwapTool(mockCtx),
      new AgentWalletBridgeTool(mockCtx),
      new AgentWalletX402Tool(mockCtx),
    ];
    const names = new Set(tools.map((t) => t.name));
    expect(names.size).toBe(5);
  });

  test("all tools have non-empty descriptions", () => {
    const tools = [
      new AgentWalletBalanceTool(mockCtx),
      new AgentWalletTransferTool(mockCtx),
      new AgentWalletSwapTool(mockCtx),
      new AgentWalletBridgeTool(mockCtx),
      new AgentWalletX402Tool(mockCtx),
    ];
    for (const tool of tools) {
      expect(tool.description.length).toBeGreaterThan(30);
    }
  });

  test("all tools have valid zod schemas", () => {
    const tools = [
      new AgentWalletBalanceTool(mockCtx),
      new AgentWalletTransferTool(mockCtx),
      new AgentWalletSwapTool(mockCtx),
      new AgentWalletBridgeTool(mockCtx),
      new AgentWalletX402Tool(mockCtx),
    ];
    for (const tool of tools) {
      expect(tool.schema).toBeDefined();
      expect(typeof (tool.schema as any).safeParse).toBe("function");
    }
  });
});
