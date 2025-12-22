import { ethers } from 'ethers';

import { TOKEN_CONFIGS } from '../../../config/tokens';
import { type Asset } from '../../../types/evm/swap.types';
import { getEVMChains } from '../../walletconnect/config/chains';

export class AssetUtils {
  static async fetchAssets(chainId: any, address: string, network: any): Promise<Asset[]> {
    if (!this.isValidAddress(address)) {
      throw new Error('Invalid wallet address');
    }

    const availableChains = getEVMChains(network);
    const chainConfig = availableChains.find(chain => chain.chainId === chainId);

    if (!chainConfig) {
      throw new Error(`Chain ID ${chainId} not found in ${network} configuration`);
    }

    console.log('Using chain:', chainConfig.name, 'on', network);

    const chainIdToNetworkKey: Record<number, string> = {
      1: 'ethereum',
      137: 'polygon',
      56: 'bsc',
      42161: 'arbitrum',
      10: 'optimism',
      43114: 'avalanche',
      // Testnet
      11155111: 'sepolia',
      80002: 'amoy',
      97: 'bscTestnet',
      421614: 'arbitrumSepolia',
      11155420: 'optimismSepolia',
      43113: 'fuji',
    };

    const networkKey = chainIdToNetworkKey[chainId];
    if (!networkKey) {
      throw new Error(`No token configuration found for chainId: ${chainId}`);
    }
    const tokens = (TOKEN_CONFIGS as any)[networkKey];

    if (!tokens || Object.keys(tokens).length === 0) {
      console.warn(`No tokens configured for network: ${networkKey}`);
      return [];
    }

    console.log(`Loading ${Object.keys(tokens).length} tokens for ${networkKey}`);

    const assets: Asset[] = [];
    const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);

    for (const [code, rawConfig] of Object.entries(tokens as any)) {
      const config = rawConfig as {
        name: string;
        address: string;
        decimals: number;
        logoUri: string;
      };

      let balance = '0';

      try {
        const isWrappedNative = this.isWrappedNativeToken(chainId, config.address);

        if (isWrappedNative) {
          // Check for native balance (e.g., ETH, MATIC)
          const nativeBalance = await provider.getBalance(address);

          // Check for actual wrapped token balance (e.g., WETH, WMATIC)
          const wrappedContract = new ethers.Contract(
            config.address,
            ['function balanceOf(address) view returns (uint256)'],
            provider
          );

          const wrappedBalance = await wrappedContract.balanceOf(address);
          const totalBalance = nativeBalance > 0n ? nativeBalance : wrappedBalance;

          balance = ethers.formatUnits(totalBalance, config.decimals);
        } else {
          const tokenContract = new ethers.Contract(
            config.address,
            ['function balanceOf(address) view returns (uint256)'],
            provider
          );

          const tokenBalance = await tokenContract.balanceOf(address);
          balance = ethers.formatUnits(tokenBalance, config.decimals);
        }

        console.log(`${code} balance:`, balance);
      } catch (err) {
        console.error(`Failed to fetch balance for ${code} (${config.address}):`, err);
        balance = '0';
      }

      assets.push({
        code,
        name: config.name,
        decimals: config.decimals,
        address: config.address,
        balance: parseFloat(balance),
        logoUri: config.logoUri,
        isNative: false,
      });
    }

    return assets.sort((a, b) => {
      if (a.balance > 0 && b.balance === 0) return -1;
      if (a.balance === 0 && b.balance > 0) return 1;
      return a.code.localeCompare(b.code);
    });
  }

  private static isWrappedNativeToken(chainId: number, tokenAddress: string): boolean {
    const wrappedNativeAddresses: Record<number, string> = {
      // Mainnet
      1: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      137: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
      56: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
      42161: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
      10: '0x4200000000000000000000000000000000000006',
      43114: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7',
      // Testnet
      11155111: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
      80002: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
      97: '0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd',
      421614: '0xE591bf0A0CF924A0674d7792db046B23CEbF5f34',
      11155420: '0x4200000000000000000000000000000000000006',
      43113: '0xd00ae08403B9bbb9124bB305C09058E32C39A48c',
    };

    const wrappedNative = wrappedNativeAddresses[chainId];
    return wrappedNative?.toLowerCase() === tokenAddress.toLowerCase();
  }

  static isValidAddress(address: string): boolean {
    return ethers.isAddress(address);
  }

  static clearMetadataCache(): void {
    console.log('Metadata cache cleared');
  }
}
