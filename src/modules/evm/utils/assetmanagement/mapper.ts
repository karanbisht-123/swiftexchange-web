import type { ChainConfig } from '../Chainregistry';
import type { IChain } from './types';

export function mapIChainToChainConfig(chain: IChain): ChainConfig {
  const tokens: Record<string, string> = {};
  if (Array.isArray(chain.bridgeSupportTokens)) {
    chain.bridgeSupportTokens.forEach((t: any) => {
      tokens[t.symbol] = t.address;
    });
  }

  const bridgeAssets = Array.isArray(chain.bridgeSupportTokens)
    ? chain.bridgeSupportTokens
        .filter((t: any) => t.symbol !== chain.nativeToken?.symbol && t.address !== 'native')
        .map((t: any) => ({
          asset: `${t.symbol}-${t.address}`,
          type:
            chain.chainId === 'pubnet' || chain.chainId === 'testnet'
              ? 'STELLAR'
              : t.type || 'ERC20',
          address: t.address,
          name: t.name,
          symbol: t.symbol,
          decimals: t.decimals,
          logoURI: t.logoURI,
          isNative: false,
        }))
    : [];

  const supportedAssets = Array.isArray(chain.supportedTokenList)
    ? chain.supportedTokenList
        .filter((t: any) => t.symbol !== chain.nativeToken?.symbol)
        .map((t: any) => ({
          asset: t.asset || `${t.symbol}-${t.address}`,
          type:
            t.type ||
            (chain.chainId === 'pubnet' || chain.chainId === 'testnet' ? 'STELLAR' : 'ERC20'),
          address: t.address,
          name: t.name,
          symbol: t.symbol,
          decimals: t.decimals,
          logoURI: t.logoURI,
          isNative: false,
        }))
    : [];

  const existingAssetsMap = new Map<string, any>();
  for (const a of [...bridgeAssets, ...supportedAssets]) {
    const key = `${a.symbol.toUpperCase()}-${(a.address || '').toLowerCase()}`;
    if (!existingAssetsMap.has(key)) {
      existingAssetsMap.set(key, a);
    }
  }

  return {
    ...chain,
    chainId: chain.chainId,
    rpcUrl: chain.rpcUrl || chain.rpcUrls?.[0],
    fallbackRpcUrls: chain.rpcUrls?.slice(1) || [],
    available: true,
    swapEnabled: chain.swapEnable,
    blockExplorerUrl: chain.blockExplorerUrl,
    nativeCurrency: {
      name: chain.nativeToken?.name || chain.name,
      symbol: chain.nativeToken?.symbol || chain.symbol,
      decimals: chain.nativeToken?.decimals || 18,
      logoURI: chain.nativeToken?.logoURI || chain.imageUrl,
      wrappedAddress: chain.wrappedAddress || chain.nativeToken?.address,
      coingeckoId: chain.nativeChainKey,
      address: chain.nativeToken?.address,
    },
    logoURI: chain.imageUrl,
    coingeckoPlatform: chain.nativeChainKey,
    tokens,
    assets: [
      {
        asset: chain.symbol,
        type: 'NATIVE',
        address: chain.nativeToken?.address || 'NATIVE',
        name: chain.nativeToken?.name || chain.name,
        symbol: chain.nativeToken?.symbol || chain.symbol,
        decimals: chain.nativeToken?.decimals || 18,
        logoURI: chain.nativeToken?.logoURI || chain.imageUrl,
        coingeckoId: chain.nativeChainKey,
        isNative: true,
      },
      ...Array.from(existingAssetsMap.values()),
    ],
  } as unknown as ChainConfig;
}
