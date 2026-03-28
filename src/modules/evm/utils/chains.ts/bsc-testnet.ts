import type { ChainConfig } from '../Chainregistry';

const bscTestnet: ChainConfig = {
    chainId: 97,
    name: 'BNB Smart Chain Testnet',
    networkType: 'testnet',
    available: true,
    slug: 'bsc',
    rpcUrl: 'https://bsc-testnet-rpc.publicnode.com',
    fallbackRpcUrls: [
        'https://bsc-testnet.drpc.org',
        'https://data-seed-prebsc-1-s1.bnbchain.org:8545',
        'https://data-seed-prebsc-2-s1.bnbchain.org:8545',
        'https://bsc-testnet.public.blastapi.io',
    ],
    blockExplorerUrl: 'https://testnet.bscscan.com',
    nativeCurrency: {
        name: 'Test BNB',
        symbol: 'tBNB',
        decimals: 18,
        logoURI: 'https://coin-images.coingecko.com/coins/images/825/large/bnb-icon2_2x.png',
        wrappedAddress: '0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd',
        coingeckoId: 'binancecoin',
    },
    logoURI: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/binance/info/logo.png',
    coingeckoPlatform: 'bnb',
    tokenListSource: 'pancakeswap',
    tokens: {
        USDC: '0x64544969ed7EBf5f083679233325356EbE738930',
        WBNB: '0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd',
    },
    assets: [
        {
            asset: 'c97_t0x64544969ed7EBf5f083679233325356EbE738930',
            type: 'BEP20',
            address: '0x64544969ed7EBf5f083679233325356EbE738930',
            name: 'USD Coin',
            symbol: 'USDC',
            decimals: 18,
            logoURI: 'https://coin-images.coingecko.com/coins/images/6319/large/USD_Coin_icon.png',
            coingeckoId: 'usd-coin',
            pairs: [],
        },
        {
            asset: 'c97_t0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd',
            type: 'BEP20',
            address: '0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd',
            name: 'Wrapped BNB',
            symbol: 'WBNB',
            decimals: 18,
            logoURI: 'https://coin-images.coingecko.com/coins/images/825/large/bnb-icon2_2x.png',
            coingeckoId: 'binancecoin',
            pairs: [],
        },
    ],
    testnetTokenMetadata: {
        '0xae13d989dac2f0debff460ac112a837c89baa7cd': {
            name: 'Wrapped BNB',
            symbol: 'WBNB',
            decimals: 18,
            logoURI: 'https://coin-images.coingecko.com/coins/images/825/large/bnb-icon2_2x.png',
        },
        '0x64544969ed7ebf5f083679233325356ebe738930': {
            name: 'USD Coin',
            symbol: 'USDC',
            decimals: 18,
            logoURI: 'https://coin-images.coingecko.com/coins/images/6319/large/USD_Coin_icon.png',
        },
    },
};

export default bscTestnet;