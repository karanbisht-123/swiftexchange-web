import { type ChainConfig } from '../Chainregistry';
import {
    getChainLogoUrlBySlug,
    getAssetLogoUrl
} from '../ChainUrlHelpers';

const slug = 'optimism';

const optimism: ChainConfig = {
    chainId: 10,
    name: 'Optimism',
    networkType: 'mainnet',
    available: false,
    swapEnabled: true,
    slug: slug,
    rpcUrl: 'https://mainnet.optimism.io',
    fallbackRpcUrls: [
        'https://optimism-mainnet.public.blastapi.io',
        'https://1rpc.io/op',
        'https://optimism.drpc.org',
    ],
    blockExplorerUrl: 'https://optimistic.etherscan.io',
    nativeCurrency: {
        name: 'Ether',
        symbol: 'ETH',
        decimals: 18,
        logoURI: getAssetLogoUrl(slug, '0x4200000000000000000000000000000000000006'),
        wrappedAddress: '0x4200000000000000000000000000000000000006',
        coingeckoId: 'ethereum',
    },
    logoURI: getChainLogoUrlBySlug(slug),
    coingeckoPlatform: 'optimistic-ethereum',
    website: 'https://www.optimism.io/',
    description: 'Optimism is a low-cost and lightning-fast Ethereum L2 blockchain.',
    status: 'active',
    tags: ['dapp', 'layer2'],
    links: [
        { name: 'github', url: 'https://github.com/ethereum-optimism' },
        { name: 'x', url: 'https://x.com/Optimism' }
    ],
    tokens: {
        USDT: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',
        USDC: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
        DAI: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
        WBTC: '0x68f180fcCe6836688e9084f035309E29Bf0A2095',
        LINK: '0x350a791Bfc2C21F9Ed5d10980Dad2e2638ffa7f6',
        OP: '0x4200000000000000000000000000000000000042',
    },
    assets: [
        {
            asset: 'optimism_t0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',
            type: 'ERC20',
            address: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',
            name: 'Tether USD',
            symbol: 'USDT',
            decimals: 6,
            logoURI: getAssetLogoUrl(slug, '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58'),
            coingeckoId: 'tether',
            pairs: [],
        },
        {
            asset: 'optimism_t0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
            type: 'ERC20',
            address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
            name: 'USD Coin',
            symbol: 'USDC',
            decimals: 6,
            logoURI: getAssetLogoUrl(slug, '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85'),
            coingeckoId: 'usd-coin',
            pairs: [],
        },
    ],
};

export default optimism;
