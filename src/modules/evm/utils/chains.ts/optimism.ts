import type { ChainConfig } from '../Chainregistry';

const optimism: ChainConfig = {
    chainId: 10,
    name: 'Optimism',
    networkType: 'mainnet',
    available: true,
    swapEnabled: true,
    slug: 'optimism',
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
        logoURI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png',
        wrappedAddress: '0x4200000000000000000000000000000000000006',
        coingeckoId: 'ethereum',
    },
    logoURI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/optimism/info/logo.png',
    coingeckoPlatform: 'optimistic-ethereum',
    tokenListSource: 'uniswap',
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
            logoURI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/optimism/assets/0x94b008aA00579c1307B0EF2c499aD98a8ce58e58/logo.png',
            coingeckoId: 'tether',
        },
        {
            asset: 'optimism_t0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
            type: 'ERC20',
            address: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
            name: 'USD Coin',
            symbol: 'USDC',
            decimals: 6,
            logoURI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/optimism/assets/0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85/logo.png',
            coingeckoId: 'usd-coin',
        },
    ],
};

export default optimism;
