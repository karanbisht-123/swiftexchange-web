import { BrowserProvider, Contract, parseUnits } from 'ethers';

// Hyperliquid Bridge on Arbitrum (Bridge2)
export const HYPERLIQUID_BRIDGE_ADDRESS_ARBITRUM = '0x2Df1c51E09aECF9cacB7bc98cB1742757f163dF7';

// Native USDC on Arbitrum
export const USDC_ADDRESS_ARBITRUM = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';

export type DepositProgress = {
  step: 'SWITCHING_NETWORK' | 'APPROVING' | 'DEPOSITING' | 'SUCCESS' | 'FAILED';
  message: string;
  txHash?: string;
};

// Standard ERC20 ABI for Transfer and Approve
const ERC20_ABI = [
  'function transfer(address to, uint256 amount) public returns (bool)',
  'function approve(address spender, uint256 amount) public returns (bool)',
  'function allowance(address owner, address spender) public view returns (uint256)',
  'function balanceOf(address account) public view returns (uint256)',
];

/**
 * Deposits USDC to the Hyperliquid L1 Bridge on Arbitrum.
 * Hyperliquid validators listen to the `Transfer` event to the Bridge address.
 */
export async function depositToHyperliquid(
  provider: any,
  amount: string, // in human readable format (e.g., '10.5')
  onProgress?: (progress: DepositProgress) => void
): Promise<{ txHash: string; amount: string; asset: string; chainId: number }> {
  const browserProvider = new BrowserProvider(provider);
  const signer = await browserProvider.getSigner();

  onProgress?.({
    step: 'DEPOSITING',
    message: 'Initiating USDC transfer to Hyperliquid bridge...',
  });

  // USDC uses 6 decimals
  const parsedAmount = parseUnits(amount, 6);
  const usdcContract = new Contract(USDC_ADDRESS_ARBITRUM, ERC20_ABI, signer);

  // Hyperliquid bridge works by simply transferring USDC to the bridge address.
  // The L1 indexer monitors these ERC20 transfers and credits the sender.
  const tx = await usdcContract.transfer(HYPERLIQUID_BRIDGE_ADDRESS_ARBITRUM, parsedAmount);

  onProgress?.({
    step: 'DEPOSITING',
    message: 'Transaction submitted. Waiting for on-chain confirmation...',
    txHash: tx.hash,
  });

  await tx.wait();

  return {
    txHash: tx.hash,
    amount,
    asset: 'USDC',
    chainId: 42161, // Arbitrum One
  };
}
