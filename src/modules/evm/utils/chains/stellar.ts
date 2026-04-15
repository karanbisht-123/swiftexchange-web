import { type ChainConfig, type ChainAsset, type WellKnownTokens, registerDynamicAssets } from '../Chainregistry';
import {
    getChainLogoUrlBySlug
} from '../ChainUrlHelpers';

const slug = 'stellar';

const STELLAR_CURATED_ASSETS_URL = 'https://lobstr.co/api/v1/sep/assets/curated.json';


export async function fetchStellarCuratedAssets() {
    try {
        const response = await fetch(STELLAR_CURATED_ASSETS_URL);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const data = await response.json();

        const dynamicAssets: ChainAsset[] = (data.assets as any[]).map(asset => ({
            asset: `${asset.code}-${asset.issuer}`,
            type: 'STELLAR',
            address: asset.issuer,
            name: asset.name || asset.code,
            symbol: asset.code,
            decimals: asset.decimals,
            logoURI: asset.icon,
            coingeckoId: asset.code.toLowerCase() === 'usdc' ? 'usd-coin' :
                asset.code.toLowerCase() === 'eth' ? 'ethereum' :
                    asset.code.toLowerCase() === 'btc' ? 'bitcoin' :
                        asset.code.toLowerCase() === 'usdt' ? 'tether' :
                            asset.code.toLowerCase() === 'eurc' ? 'euro-coin' : undefined
        }));

        const dynamicTokens: WellKnownTokens = {
            USDC: data.assets.find((a: any) => a.code === 'USDC' && a.domain === 'circle.com')?.issuer,
            USDT: data.assets.find((a: any) => a.code === 'USDT' && a.domain === 'tether.to')?.issuer,
            EURC: data.assets.find((a: any) => a.code === 'EURC' && a.domain === 'circle.com')?.issuer,
        };
        registerDynamicAssets(9000000, dynamicAssets, dynamicTokens);

        console.log('[Stellar] Dynamically loaded curated assets from Lobstr');
    } catch (error) {
        console.error('[Stellar] Failed to fetch curated assets:', error);
    }
}

const nativeCurrency: ChainAsset & { wrappedAddress: string } = {
    asset: 'XLM',
    type: 'NATIVE',
    address: 'native',
    name: 'Stellar Lumens',
    symbol: 'XLM',
    decimals: 7,
    logoURI: getChainLogoUrlBySlug(slug),
    coingeckoId: 'stellar',
    wrappedAddress: 'native',
};

const coreAssets: ChainAsset[] = [
    nativeCurrency,
    {
        asset: 'yUSDC-GDGTVWSM4MGS4T7Z6W4RPWOCHE2I6RDFCIFZGS3DOA63LWQTRNZNTTFF',
        type: 'STELLAR',
        address: 'GDGTVWSM4MGS4T7Z6W4RPWOCHE2I6RDFCIFZGS3DOA63LWQTRNZNTTFF',
        name: 'Yieldblox USDC',
        symbol: 'yUSDC',
        decimals: 7,
        logoURI: 'https://ultracapital.xyz/static/images/icons/yUSDC.png',
        coingeckoId: 'yusdc',
    }
];

export const stellarMainnet: ChainConfig = {
    chainId: 9000000,
    name: 'Stellar',
    networkType: 'mainnet',
    available: true,
    swapEnabled: true,
    slug: slug,
    rpcUrl: 'https://horizon.stellar.org',
    blockExplorerUrl: 'https://stellar.expert/explorer/public',
    nativeCurrency: nativeCurrency as any,
    logoURI: getChainLogoUrlBySlug(slug),
    coingeckoPlatform: 'stellar',
    tokens: {
        USDC: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
        yUSDC: 'GDGTVWSM4MGS4T7Z6W4RPWOCHE2I6RDFCIFZGS3DOA63LWQTRNZNTTFF',
    },
    assets: coreAssets,
    website: 'https://stellar.org/',
    description: 'A decentralized, fast, and sustainable network for financial products and services.',
    status: 'active',
};

export const stellarTestnet: ChainConfig = {
    chainId: 9000001,
    name: 'Stellar Testnet',
    networkType: 'testnet',
    available: true,
    swapEnabled: true,
    slug: slug,
    rpcUrl: 'https://horizon-testnet.stellar.org',
    blockExplorerUrl: 'https://stellar.expert/explorer/testnet',
    nativeCurrency: {
        name: 'Stellar Lumens',
        symbol: 'XLM',
        decimals: 7,
        logoURI: getChainLogoUrlBySlug(slug),
        wrappedAddress: 'native',
        coingeckoId: 'stellar',
    },
    logoURI: getChainLogoUrlBySlug(slug),
    coingeckoPlatform: 'stellar',
    tokens: {
        USDC: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
        EURC: 'GB3Q6QDZYTHWT7E5PVS3W7FUT5GVAFC5KSZFFLPU25GO7VTC3NM2ZTVO',
    },
    assets: [
        {
            asset: 'XLM',
            type: 'NATIVE',
            address: 'native',
            name: 'Stellar Lumens',
            symbol: 'XLM',
            decimals: 7,
            logoURI: getChainLogoUrlBySlug(slug),
            coingeckoId: 'stellar',
        },
        {
            asset: 'USDC-GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
            type: 'STELLAR',
            address: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
            name: 'USD Coin',
            symbol: 'USDC',
            decimals: 7,
            logoURI: 'https://www.circle.com/usdc-icon',
            coingeckoId: 'usd-coin',
        },
        {
            asset: 'EURC-GB3Q6QDZYTHWT7E5PVS3W7FUT5GVAFC5KSZFFLPU25GO7VTC3NM2ZTVO',
            type: 'STELLAR',
            address: 'GB3Q6QDZYTHWT7E5PVS3W7FUT5GVAFC5KSZFFLPU25GO7VTC3NM2ZTVO',
            name: 'Euro Coin',
            symbol: 'EURC',
            decimals: 7,
            logoURI: 'https://www.circle.com/eurc-icon',
            coingeckoId: 'euro-coin',
        },
    ],
    status: 'active',
};

export default [stellarMainnet, stellarTestnet];