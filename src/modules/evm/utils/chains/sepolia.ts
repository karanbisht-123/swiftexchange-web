import { type ChainConfig } from '../Chainregistry';
import {
    getChainLogoUrlBySlug,
    getAssetLogoUrl
} from '../ChainUrlHelpers';


const slug = 'sepolia';

const sepolia: ChainConfig = {
    chainId: 11155111,
    name: 'Sepolia',
    networkType: 'testnet',
    available: true,
    swapEnabled: true,
    slug: slug,
    rpcUrl: 'https://ethereum-sepolia.publicnode.com',
    fallbackRpcUrls: [
        'https://rpc.sepolia.org',
        'https://rpc2.sepolia.org',
        'https://sepolia.drpc.org',
        'https://eth-sepolia.public.blastapi.io',
    ],
    blockExplorerUrl: 'https://sepolia.etherscan.io',
    nativeCurrency: {
        name: 'Sepolia Ether',
        symbol: 'ETH',
        decimals: 18,
        logoURI: getAssetLogoUrl('ethereum', '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'),
        wrappedAddress: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
        coingeckoId: 'ethereum',
    },
    logoURI: getChainLogoUrlBySlug(slug),
    coingeckoPlatform: 'ethereum',
    website: 'https://sepolia.dev',
    description: 'Sepolia was designed to simulate harsh network conditions, and has shorter block times, which enable faster transaction confirmation times and feedback for developers.',
    status: 'active',
    tags: ['testnet'],
    links: [
        { name: 'website', url: 'https://sepolia.dev' }
    ],
    tokens: {
        USDC: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
        WETH: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
    },
    assets: [
        {
            asset: 'c11155111_t0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
            type: 'ERC20',
            address: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
            name: 'USD Coin',
            symbol: 'USDC',
            decimals: 6,
            logoURI: getAssetLogoUrl('ethereum', '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'),
            coingeckoId: 'usd-coin',
            pairs: [],
        },
        {
            asset: 'c11155111_t0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
            type: 'ERC20',
            address: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
            name: 'Wrapped Ether',
            symbol: 'WETH',
            decimals: 18,
            logoURI: getAssetLogoUrl('ethereum', '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'),
            coingeckoId: 'weth',
            pairs: [],
        },
    ],
    testnetTokenMetadata: {
        '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14': {
            name: 'Wrapped Ether',
            symbol: 'WETH',
            decimals: 18,
            logoURI: getAssetLogoUrl('ethereum', '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'),
        },
        '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238': {
            name: 'USD Coin',
            symbol: 'USDC',
            decimals: 6,
            logoURI: getAssetLogoUrl('ethereum', '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'),
        },
    },
};

export default sepolia;