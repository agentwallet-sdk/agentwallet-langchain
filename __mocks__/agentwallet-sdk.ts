// Mock for agentwallet-sdk used in tests

export const NATIVE_TOKEN = "0x0000000000000000000000000000000000000000";

export const createWallet = jest.fn().mockReturnValue({
  address: "0xWalletAddress",
  walletClient: {
    account: { address: "0xAgentAddress" },
  },
  publicClient: {},
  contract: {},
  chain: { id: 8453, name: "base" },
});

export const checkBudget = jest.fn().mockResolvedValue({
  token: "0x0000000000000000000000000000000000000000",
  perTxLimit: 1000000000000000000n,
  remainingInPeriod: 5000000000000000000n,
});

export const agentExecute = jest.fn().mockResolvedValue({
  executed: true,
  txHash: "0xmockTxHash",
});

export const agentTransferToken = jest.fn().mockResolvedValue("0xmockTransferHash");

export const createBridge = jest.fn().mockResolvedValue({
  bridge: jest.fn().mockResolvedValue({
    burnTxHash: "0xmockBurnHash",
    estimatedSeconds: 300,
    attestationUrl: "https://iris-api.circle.com/v2/attestations/0xmockBurnHash",
  }),
});

export const createX402Client = jest.fn().mockReturnValue({
  fetch: jest.fn().mockResolvedValue({
    status: 200,
    text: jest.fn().mockResolvedValue('{"data":"premium content"}'),
  }),
  lastPayment: { amount: BigInt(10000) },
});

export class SmartSwapRouter {
  constructor(_config?: any) {}
  getQuotes = jest.fn().mockResolvedValue([
    {
      provider: "uniswap",
      fromToken: "ETH",
      toToken: "USDC",
      fromAmount: 50000000000000000n,
      toAmount: 99500000n,
      gasEstimate: 100000n,
      gasEstimateUsd: 0.15,
      platformFee: 30,
      netOutput: 99400000n,
      priceImpact: 0.1,
      route: ["Uniswap V3"],
      estimatedTimeMs: 2000,
      mevProtected: false,
    },
  ]);
  executeSwap = jest.fn().mockResolvedValue({
    txHash: "0xmockSwapHash",
    quote: {
      provider: "uniswap",
      toAmount: 99500000n,
    },
    chain: "base",
  });
}
