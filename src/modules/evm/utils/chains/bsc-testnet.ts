import { type ChainConfig } from '../Chainregistry';
import {
    getChainLogoUrlBySlug,
    getAssetLogoUrl
} from '../ChainUrlHelpers';
const logoSlug = 'smartchain'; // Use mainnet slug for logos
const chainSlug = 'binance';

const bscTestnet: ChainConfig = {
    chainId: 97,
    name: 'BNB Smart Chain Testnet',
    networkType: 'testnet',
    available: true,
    swapEnabled: true,
    slug: chainSlug,
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
        logoURI: getAssetLogoUrl(logoSlug, '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c'),
        wrappedAddress: '0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd',
        coingeckoId: 'binancecoin',
    },
    logoURI: getChainLogoUrlBySlug(logoSlug),
    coingeckoPlatform: 'bnb',
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
            logoURI: getAssetLogoUrl(logoSlug, '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d'),
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
            logoURI: getAssetLogoUrl(logoSlug, '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c'),
            coingeckoId: 'binancecoin',
            pairs: [],
        },
    ],
    testnetTokenMetadata: {
        '0xae13d989dac2f0debff460ac112a837c89baa7cd': {
            name: 'Wrapped BNB',
            symbol: 'WBNB',
            decimals: 18,
            logoURI: getAssetLogoUrl(logoSlug, '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c'),
        },
        '0x64544969ed7ebf5f083679233325356ebe738930': {
            name: 'USD Coin',
            symbol: 'USDC',
            decimals: 18,
            logoURI: getAssetLogoUrl(logoSlug, '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d'),
        },
    },
};

export default bscTestnet;