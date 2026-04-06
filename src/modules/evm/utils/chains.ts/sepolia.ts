import type { ChainConfig } from '../Chainregistry';

const sepolia: ChainConfig = {
    chainId: 11155111,
    name: 'Sepolia',
    networkType: 'testnet',
    available: true,
    swapEnabled: true,
    slug: 'eth',
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
        logoURI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
        wrappedAddress: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
        coingeckoId: 'ethereum',
    },
    logoURI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png',
    coingeckoPlatform: 'ethereum',
    tokenListSource: 'uniswap',
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
            logoURI: 'https://coin-images.coingecko.com/coins/images/6319/large/USD_Coin_icon.png',
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
            logoURI: 'https://coin-images.coingecko.com/coins/images/2518/large/weth.png',
            coingeckoId: 'weth',
            pairs: [],
        },
    ],
    testnetTokenMetadata: {
        '0xfff9976782d46cc05630d1f6ebab18b2324d6b14': {
            name: 'Wrapped Ether',
            symbol: 'WETH',
            decimals: 18,
            logoURI: 'https://coin-images.coingecko.com/coins/images/2518/large/weth.png',
        },
        '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238': {
            name: 'USD Coin',
            symbol: 'USDC',
            decimals: 6,
            logoURI: 'https://coin-images.coingecko.com/coins/images/6319/large/USD_Coin_icon.png',
        },
    },
};

export default sepolia;