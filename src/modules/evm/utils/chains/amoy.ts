import { type ChainConfig } from '../Chainregistry';
import {
    getChainLogoUrlBySlug,
    getAssetLogoUrl
} from '../ChainUrlHelpers';

const logoSlug = 'polygon';
const chainSlug = 'polygon';

const amoy: ChainConfig = {
    chainId: 80002,
    name: 'Amoy',
    networkType: 'testnet',
    available: false,
    slug: chainSlug,
    rpcUrl: 'https://rpc-amoy.polygon.technology',
    blockExplorerUrl: 'https://www.oklink.com/amoy',
    nativeCurrency: {
        name: 'MATIC',
        symbol: 'MATIC',
        decimals: 18,
        logoURI: getAssetLogoUrl(logoSlug, '0x0000000000000000000000000000000000001010'),
        wrappedAddress: '0x9c3C9283D3e44854697Cd22D3Faa240Cfb032889',
        coingeckoId: 'matic-network',
    },
    logoURI: getChainLogoUrlBySlug(logoSlug),
    coingeckoPlatform: 'polygon-pos',
    tokens: {
        USDC: '0x41E94Eb019C0762f9Bfcf9Fb1C3F3ffc1991a9E9',
        WMATIC: '0x9c3C9283D3e44854697Cd22D3Faa240Cfb032889',
    },
    assets: [
        {
            asset: 'c80002_t0x41E94Eb019C0762f9Bfcf9Fb1C3F3ffc1991a9E9',
            type: 'ERC20',
            address: '0x41E94Eb019C0762f9Bfcf9Fb1C3F3ffc1991a9E9',
            name: 'USD Coin',
            symbol: 'USDC',
            decimals: 6,
            logoURI: getAssetLogoUrl(logoSlug, '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'),
            coingeckoId: 'usd-coin',
            pairs: [],
        },
        {
            asset: 'c80002_t0x9c3C9283D3e44854697Cd22D3Faa240Cfb032889',
            type: 'ERC20',
            address: '0x9c3C9283D3e44854697Cd22D3Faa240Cfb032889',
            name: 'Wrapped Matic',
            symbol: 'WMATIC',
            decimals: 18,
            logoURI: getAssetLogoUrl(logoSlug, '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270'),
            coingeckoId: 'matic-network',
            pairs: [],
        },
    ],
    testnetTokenMetadata: {
        '0x9c3c9283d3e44854697cd22d3faa240cfb032889': {
            name: 'Wrapped Matic',
            symbol: 'WMATIC',
            decimals: 18,
            logoURI: getAssetLogoUrl(logoSlug, '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270'),
        },
        '0x41e94eb019c0762f9bfcf9fb1c3f3ffc1991a9e9': {
            name: 'USD Coin',
            symbol: 'USDC',
            decimals: 6,
            logoURI: getAssetLogoUrl(logoSlug, '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'),
        },
    },
    swapEnabled: false
};

export default amoy;