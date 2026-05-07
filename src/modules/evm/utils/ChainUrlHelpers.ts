import { ASSET_CDN_BASE } from './assetmanagement/constants';
import { getGlobalAssetMetadata } from './Chainregistry';

export function getChainInfoUrl(slug: string): string {
    return `${ASSET_CDN_BASE}/${slug}/info/info.json`;
}

export function getChainLogoUrlBySlug(slug: string): string {
    return `${ASSET_CDN_BASE}/${slug}/info/logo.png`;
}

export function getAssetLogoUrl(slug: string, address: string): string {
    return `${ASSET_CDN_BASE}/${slug}/${address}.png`;
}

export function getTokenIcon(symbol: string, chainConfig?: any, address?: string): string {
    if (!chainConfig) return '';
    const tokenAddress = address || chainConfig.tokens?.[symbol];
    if (tokenAddress) {
        const registryAsset = chainConfig.assets?.find((a: any) =>
            a.address.toLowerCase() === tokenAddress.toLowerCase() ||
            a.symbol?.toUpperCase() === symbol?.toUpperCase()
        );
        if (registryAsset?.logoURI) return registryAsset.logoURI;
    }

    if (symbol && symbol === chainConfig.nativeCurrency?.symbol) {
        return chainConfig.nativeCurrency?.logoURI || getChainLogoUrlBySlug(chainConfig.slug);
    }
    if (chainConfig.chainId === 'pubnet' || chainConfig.chainId === 'testnet') {
        if (tokenAddress) {
            return `${ASSET_CDN_BASE}/stellar/assets/${symbol}-${tokenAddress}/logo.png`;
        }
    }

    const globalMeta = getGlobalAssetMetadata(symbol);
    if (globalMeta?.logoURI) return globalMeta.logoURI;

    return '';
}
