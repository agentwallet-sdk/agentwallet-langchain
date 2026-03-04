export const zeroAddress = "0x0000000000000000000000000000000000000000";
export const parseUnits = jest.fn().mockImplementation((val: string, dec: number) => {
  return BigInt(Math.floor(parseFloat(val) * 10 ** Math.min(dec, 9)));
});
export const formatUnits = jest.fn().mockImplementation((val: bigint, _dec: number) => {
  return (Number(val) / 1e18).toString();
});
export const createWalletClient = jest.fn().mockReturnValue({
  account: { address: "0xAgentAddress" },
});
export const createPublicClient = jest.fn().mockReturnValue({});
export const http = jest.fn().mockReturnValue({});
