import type { IChain } from './types';
import type { ChainConfig } from '../Chainregistry';

export function mapIChainToChainConfig(chain: IChain): ChainConfig {
  return {
    ...chain,
    chainId: typeof chain.chainId === 'string' ? 0 : chain.chainId, // Ensure number for Chainregistry for now
    rpcUrl: chain.rpcUrl || chain.rpcUrls[0],
    fallbackRpcUrls: chain.rpcUrls.slice(1),
    available: true,
    swapEnabled: chain.swapEnable,
    blockExplorerUrl: chain.blockExplorerUrl,
    nativeCurrency: {
      name: chain.nativeToken.name,
      symbol: chain.nativeToken.symbol,
      decimals: chain.nativeToken.decimals,
      logoURI: chain.nativeToken.logoURI,
      wrappedAddress: chain.wrappedAddress || chain.nativeToken.address,
      coingeckoId: chain.nativeChainKey,
    },
    logoURI: chain.imageUrl,
    coingeckoPlatform: chain.nativeChainKey,
    tokens: {},
    assets: [
      {
        asset: chain.symbol,
        type: 'NATIVE',
        address: chain.nativeToken.address,
        name: chain.nativeToken.name,
        symbol: chain.nativeToken.symbol,
        decimals: chain.nativeToken.decimals,
        logoURI: chain.nativeToken.logoURI,
        coingeckoId: chain.nativeChainKey,
      },
    ],
  } as unknown as ChainConfig;
}
