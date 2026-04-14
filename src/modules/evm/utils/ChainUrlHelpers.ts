export const ASSET_CDN_BASE = 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains';

export function getChainInfoUrl(slug: string): string {
    return `${ASSET_CDN_BASE}/${slug}/info/info.json`;
}

export function getChainLogoUrlBySlug(slug: string): string {
    return `${ASSET_CDN_BASE}/${slug}/info/logo.png`;
}

export function getAssetLogoUrl(slug: string, address: string): string {
    return `${ASSET_CDN_BASE}/${slug}/assets/${address}/logo.png`;
}

export function getTokenIcon(symbol: string, chainConfig?: any, address?: string): string {
    if (!chainConfig) return 'https://coin-images.coingecko.com/coins/images/6319/large/usdc.png';

    // Handle Stellar (Chain ID 9000000 or 9000001)
    if (chainConfig.chainId === 9000000 || chainConfig.chainId === 9000001) {
        if (symbol === 'XLM' || symbol === chainConfig.nativeCurrency?.symbol) {
            return `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/stellar/info/logo.png`;
        }

        const tokenAddress = address || chainConfig.tokens?.[symbol];
        if (tokenAddress) {
            return `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/stellar/assets/${symbol}-${tokenAddress}/logo.png`;
        }
    }

    if (symbol === chainConfig.nativeCurrency?.symbol) {
        return chainConfig.nativeCurrency.logoURI;
    }

    const tokenAddress = chainConfig.tokens?.[symbol];
    if (tokenAddress) {
        const asset = chainConfig.assets?.find((a: any) =>
            a.address.toLowerCase() === tokenAddress.toLowerCase()
        );
        if (asset?.logoURI) return asset.logoURI;
    }

    return 'https://coin-images.coingecko.com/coins/images/6319/large/usdc.png';
}
