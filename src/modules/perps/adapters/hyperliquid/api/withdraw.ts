import { HttpTransport } from '@nktkas/hyperliquid';
import { withdraw3 } from '@nktkas/hyperliquid/api/exchange';

/**
 * Initiates a withdrawal request from the Hyperliquid L1 AppChain back to Arbitrum L1.
 * This requires the user to sign an EIP-712 payload with their main L1 wallet.
 *
 * @param signer The user's main ethers.js Signer
 * @param destination The L1 Arbitrum address to receive the USDC
 * @param amount The amount of USDC to withdraw (e.g. '10.5')
 * @param isTestnet Whether to use testnet
 */
export async function withdrawFromHyperliquid(
  signer: any,
  destination: string,
  amount: string,
  isTestnet: boolean = false
): Promise<void> {
  const transport = new HttpTransport({ isTestnet });

  try {
    await withdraw3(
      { transport, wallet: signer },
      { destination: destination as `0x${string}`, amount }
    );
  } catch (error: any) {
    console.error('[hyperliquid] withdraw3 failed:', error);
    throw new Error(error?.message || 'Failed to submit Hyperliquid withdrawal.');
  }
}
