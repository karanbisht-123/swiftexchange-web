import { ethers } from 'ethers';

import { type NetworkKey } from '../../../config/swapConfigs';
import { TOKEN_CONFIGS } from '../../../config/tokens';
import { type Asset } from '../../../types/evm/swap.types';
import { getEVMNetworkConfig } from './evmSwapUtils';

export class AssetUtils {
  static async fetchAssets(networkKey: NetworkKey, address: string): Promise<Asset[]> {
    if (!this.isValidAddress(address)) {
      throw new Error('Invalid wallet address');
    }

    const tokens = TOKEN_CONFIGS[networkKey] || {};
    const assets: Asset[] = [];
    const provider = new ethers.JsonRpcProvider(getEVMNetworkConfig(networkKey).rpcUrl);

    for (const [code, config] of Object.entries(tokens)) {
      let balance = '0';
      try {
        const tokenContract = new ethers.Contract(
          config.address,
          ['function balanceOf(address) view returns (uint256)'],
          provider
        );
        balance = ethers.formatUnits(await tokenContract.balanceOf(address), config.decimals);
      } catch (err) {
        console.error(`Failed to fetch balance for ${code}:`, err);
        balance = '0';
      }

      assets.push({
        code,
        name: config.name,
        decimals: config.decimals,
        address: config.address,
        balance: parseFloat(balance),
        logoUri: config.logoUri,
        isNative: false, // All tokens are wrapped (WETH, WBNB, WMATIC, USDC)
      });
    }

    return assets;
  }

  static isValidAddress(address: string): boolean {
    return ethers.isAddress(address);
  }

  static clearMetadataCache(): void {
    // Implement cache clearing if needed
  }
}
