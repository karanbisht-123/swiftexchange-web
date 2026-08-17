import { type Asset } from '../../walletconnect/store/portfolioStore';

// Asset type detection

export function isStellarAsset(asset: Asset): boolean {
  return (
    (asset as any).chainType === 'stellar' ||
    asset.chainId === 'pubnet' ||
    asset.chainId === 'testnet'
  );
}

export function isDydxChain(chainId: any): boolean {
  return typeof chainId === 'string' && chainId.startsWith('dydx-');
}

// Non-USDC EVM
export function needsSwapToUsdc(asset: Asset): boolean {
  if (isStellarAsset(asset)) return false;
  if (isDydxChain(asset.chainId)) return false;
  if (asset.isNative) return false;
  return asset.symbol.toUpperCase() !== 'USDC';
}

export function isDirectDeposit(asset: Asset): boolean {
  return !isStellarAsset(asset) && !needsSwapToUsdc(asset) && !isDydxChain(asset.chainId);
}

// Modal step type

export type ModalStep = 'form' | 'select_token' | 'tracker' | 'asset_info';

export type AssetInfoContext = 'stellar' | 'swap_needed' | null;

export function buildSwapUrl(asset: Asset, targetEvmChainId?: string | number): string {
  const params = new URLSearchParams();
  const isStellar = isStellarAsset(asset);

  params.set('fromChainId', String(asset.chainId));

  const toChainId = isStellar ? targetEvmChainId || 137 : asset.chainId;
  params.set('toChainId', String(toChainId));

  params.set('sellAsset', asset.symbol);
  if (asset.address) params.set('sellAddress', asset.address);
  params.set('buyAsset', 'USDC');
  params.set('returnTo', 'deposit');
  return `/trading/swap?${params.toString()}`;
}

export const EXCLUDED_CHAIN_IDS = new Set([56]);

export function isPriorityAsset(asset: Asset): boolean {
  const sym = asset.symbol.toUpperCase();
  const chainId = asset.chainId;

  if (isStellarAsset(asset)) return sym === 'USDC';
  if (Number(chainId) === 43114) return sym === 'USDC';
  return asset.isNative === true || sym === 'USDC';
}
