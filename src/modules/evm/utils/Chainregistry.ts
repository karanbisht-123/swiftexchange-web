
export type NetworkType = 'mainnet' | 'testnet';

/** Coingecko asset-platform identifier used for metadata lookups */
export type CoinGeckoPlatform =
    | 'ethereum'
    | 'bnb'
    | 'polygon-pos'
    | 'avalanche'
    | 'arbitrum-one'
    | 'optimistic-ethereum'
    | 'base'
    | string;

export interface NativeCurrency {
    name: string;
    symbol: string;
    decimals: number;
    logoURI: string;
    wrappedAddress: string;
    coingeckoId: string;
}

export interface WellKnownTokens {
    USDT?: string;
    USDC?: string;
    DAI?: string;
    WBTC?: string;
    WETH?: string;
    [symbol: string]: string | undefined;
}

export interface ChainConfig {
    /** EIP-155 chain id */
    chainId: number;
    /** Human-readable name shown in the UI */
    name: string;
    /** "mainnet" | "testnet" */
    networkType: NetworkType;
    /** Short key used as a URL / config segment (e.g. "eth", "bsc") */
    slug: string;
    /** Primary public RPC */
    rpcUrl: string;
    /** Ordered fallback RPCs (first = highest priority) */
    fallbackRpcUrls?: string[];
    /** Block explorer root (no trailing slash) */
    blockExplorerUrl: string;
    /** Native currency details */
    nativeCurrency: NativeCurrency;
    /** Chain logo */
    logoURI: string;
    /** Coingecko asset platform for ERC-20 metadata */
    coingeckoPlatform: CoinGeckoPlatform;
    /**
     * Token-list source.
     * Supported values: "uniswap" | "pancakeswap" | "custom"
     * For "custom" the consumer imports its own JSON.
     */
    tokenListSource: 'uniswap' | 'pancakeswap' | 'custom';
    /** Well-known ERC-20 addresses on this chain */
    tokens: WellKnownTokens;
    /**
     * Uniswap-V3-style swap router address on this chain.
     * Leave undefined if swaps are not supported yet.
     */
    swapRouterAddress?: string;
    /**
     * Hardcoded metadata for testnet tokens that CoinGecko won't return.
     * Key = lowercase token address.
     */
    testnetTokenMetadata?: Record<
        string,
        { name: string; symbol: string; decimals: number; logoURI?: string }
    >;
}

// ─── Registry ─────────────────────────────────────────────────────────────────

/**
 * THE REGISTRY.
 *
 * Add one entry here to support a new chain everywhere in the app.
 */
export const CHAIN_REGISTRY: ChainConfig[] = [
    // ── Ethereum Mainnet ──────────────────────────────────────────────────────
    {
        chainId: 1,
        name: 'Ethereum',
        networkType: 'mainnet',
        slug: 'eth',
        rpcUrl: 'https://ethereum-rpc.publicnode.com',
        fallbackRpcUrls: [
            'https://cloudflare-eth.com',
            'https://eth.drpc.org',
            'https://eth.llamarpc.com',
            'https://rpc.flashbots.net/fast',
            'https://eth.api.onfinality.io/public',
            'https://rpc.mevblocker.io',
        ],
        blockExplorerUrl: 'https://etherscan.io',
        nativeCurrency: {
            name: 'Ether',
            symbol: 'ETH',
            decimals: 18,
            logoURI:
                'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
            wrappedAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
            coingeckoId: 'ethereum',
        },
        logoURI:
            'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png',
        coingeckoPlatform: 'ethereum',
        tokenListSource: 'uniswap',
        swapRouterAddress: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
        tokens: {
            USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
            USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
            DAI: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
            WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
            WBTC: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
            LINK: '0x514910771AF9Ca656af840dff83E8264EcF986CA',
            UNI: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
            AAVE: '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9',
            SHIB: '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE',
        },
    },

    // ── BNB Smart Chain Mainnet ───────────────────────────────────────────────
    {
        chainId: 56,
        name: 'BNB Smart Chain',
        networkType: 'mainnet',
        slug: 'bsc',
        rpcUrl: 'https://bsc.publicnode.com',
        fallbackRpcUrls: [
            'https://bsc-dataseed.bnbchain.org',
            'https://bsc-dataseed1.defibit.io',
            'https://bsc-dataseed2.defibit.io',
            'https://bsc-dataseed1.ninicoin.io',
            'https://bsc.drpc.org',
            'https://bsc.meowrpc.com',
            'https://1rpc.io/bnb',
        ],
        blockExplorerUrl: 'https://bscscan.com',
        nativeCurrency: {
            name: 'BNB',
            symbol: 'BNB',
            decimals: 18,
            logoURI:
                'https://tokens.pancakeswap.finance/images/0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c.png',
            wrappedAddress: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
            coingeckoId: 'binancecoin',
        },
        logoURI:
            'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/binance/info/logo.png',
        coingeckoPlatform: 'bnb',
        tokenListSource: 'pancakeswap',
        swapRouterAddress: '0x13f4EA83D0bd40E75C8222255bc855a974568Dd4',
        tokens: {
            USDT: '0x55d398326f99059fF775485246999027B3197955',
            USDC: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
            DAI: '0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3',
            WETH: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8',
            WBTC: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c',
            WBNB: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
            LINK: '0xF8A0BF9cF54Bb92F17374d9e9A321E6a111a51bD',
            AAVE: '0xfb6115445Bff7b52FeB98650C87f44907E58f802',
        },
    },

    // ── Polygon Mainnet ───────────────────────────────────────────────────────
    //   {
    //     chainId: 137,
    //     name: 'Polygon',
    //     networkType: 'mainnet',
    //     slug: 'polygon',
    //     rpcUrl: 'https://polygon-rpc.com',
    //     fallbackRpcUrls: [
    //       'https://rpc-mainnet.matic.network',
    //       'https://polygon.drpc.org',
    //       'https://1rpc.io/matic',
    //     ],
    //     blockExplorerUrl: 'https://polygonscan.com',
    //     nativeCurrency: {
    //       name: 'MATIC',
    //       symbol: 'MATIC',
    //       decimals: 18,
    //       logoURI:
    //         'https://coin-images.coingecko.com/coins/images/4713/large/matic-token-icon.png',
    //       wrappedAddress: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
    //       coingeckoId: 'matic-network',
    //     },
    //     logoURI:
    //       'https://coin-images.coingecko.com/coins/images/4713/large/matic-token-icon.png',
    //     coingeckoPlatform: 'polygon-pos',
    //     tokenListSource: 'uniswap',
    //     swapRouterAddress: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
    //     tokens: {
    //       USDT: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
    //       USDC: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
    //       DAI: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',
    //       WETH: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
    //       WBTC: '0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6',
    //       LINK: '0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39',
    //       AAVE: '0xD6DF932A45C0f255f85145f286eA0b292B21C90B',
    //     },
    //   },

    // ── Avalanche Mainnet ─────────────────────────────────────────────────────
    //   {
    //     chainId: 43114,
    //     name: 'Avalanche',
    //     networkType: 'mainnet',
    //     slug: 'avax',
    //     rpcUrl: 'https://api.avax.network/ext/bc/C/rpc',
    //     fallbackRpcUrls: ['https://avalanche.drpc.org', 'https://1rpc.io/avax/c'],
    //     blockExplorerUrl: 'https://snowtrace.io',
    //     nativeCurrency: {
    //       name: 'Avalanche',
    //       symbol: 'AVAX',
    //       decimals: 18,
    //       logoURI:
    //         'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/avalanchec/info/logo.png',
    //       wrappedAddress: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7',
    //       coingeckoId: 'avalanche-2',
    //     },
    //     logoURI:
    //       'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/avalanchec/info/logo.png',
    //     coingeckoPlatform: 'avalanche',
    //     tokenListSource: 'custom',
    //     tokens: {
    //       USDT: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7',
    //       USDC: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
    //       DAI: '0xd586E7F844cEa2F87f50152665BCbc2C279D8d70',
    //       WETH: '0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB',
    //       WBTC: '0x50b7545627a5162F82A992c33b87aDc75187B218',
    //     },
    //   },

    // ── Arbitrum One ──────────────────────────────────────────────────────────
    //   {
    //     chainId: 42161,
    //     name: 'Arbitrum One',
    //     networkType: 'mainnet',
    //     slug: 'arb',
    //     rpcUrl: 'https://arb1.arbitrum.io/rpc',
    //     fallbackRpcUrls: ['https://arbitrum.drpc.org', 'https://1rpc.io/arb'],
    //     blockExplorerUrl: 'https://arbiscan.io',
    //     nativeCurrency: {
    //       name: 'Ether',
    //       symbol: 'ETH',
    //       decimals: 18,
    //       logoURI:
    //         'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
    //       wrappedAddress: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    //       coingeckoId: 'ethereum',
    //     },
    //     logoURI: 'https://coin-images.coingecko.com/coins/images/16547/large/photo_2023-03-29_21.47.00.jpeg',
    //     coingeckoPlatform: 'arbitrum-one',
    //     tokenListSource: 'uniswap',
    //     swapRouterAddress: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
    //     tokens: {
    //       USDT: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
    //       USDC: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    //       DAI: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
    //       WETH: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1',
    //     },
    //   },

    // ── Optimism ──────────────────────────────────────────────────────────────
    //   {
    //     chainId: 10,
    //     name: 'Optimism',
    //     networkType: 'mainnet',
    //     slug: 'op',
    //     rpcUrl: 'https://mainnet.optimism.io',
    //     fallbackRpcUrls: ['https://optimism.drpc.org', 'https://1rpc.io/op'],
    //     blockExplorerUrl: 'https://optimistic.etherscan.io',
    //     nativeCurrency: {
    //       name: 'Ether',
    //       symbol: 'ETH',
    //       decimals: 18,
    //       logoURI:
    //         'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
    //       wrappedAddress: '0x4200000000000000000000000000000000000006',
    //       coingeckoId: 'ethereum',
    //     },
    //     logoURI: 'https://coin-images.coingecko.com/coins/images/25244/large/Optimism.png',
    //     coingeckoPlatform: 'optimistic-ethereum',
    //     tokenListSource: 'uniswap',
    //     swapRouterAddress: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
    //     tokens: {
    //       USDT: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',
    //       USDC: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
    //       DAI: '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1',
    //       WETH: '0x4200000000000000000000000000000000000006',
    //     },
    //   },

    // ── Base ──────────────────────────────────────────────────────────────────
    {
        chainId: 8453,
        name: 'Base',
        networkType: 'mainnet',
        slug: 'base',
        rpcUrl: 'https://mainnet.base.org',
        fallbackRpcUrls: ['https://base.drpc.org', 'https://1rpc.io/base'],
        blockExplorerUrl: 'https://basescan.org',
        nativeCurrency: {
            name: 'Ether',
            symbol: 'ETH',
            decimals: 18,
            logoURI:
                'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
            wrappedAddress: '0x4200000000000000000000000000000000000006',
            coingeckoId: 'ethereum',
        },
        logoURI: 'https://coin-images.coingecko.com/coins/images/31061/large/base.webp',
        coingeckoPlatform: 'base',
        tokenListSource: 'uniswap',
        swapRouterAddress: '0x2626664c2603336E57B271c5C0b26F421741e481',
        tokens: {
            USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
            DAI: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
            WETH: '0x4200000000000000000000000000000000000006',
        },
    },

    // ── Sepolia Testnet ───────────────────────────────────────────────────────
    {
        chainId: 11155111,
        name: 'Sepolia',
        networkType: 'testnet',
        slug: 'eth',                    // same slug as mainnet Ethereum — resolved by networkType
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
            logoURI:
                'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2/logo.png',
            wrappedAddress: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
            coingeckoId: 'ethereum',
        },
        logoURI:
            'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/info/logo.png',
        coingeckoPlatform: 'ethereum',
        tokenListSource: 'uniswap',
        tokens: {
            USDC: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
            WETH: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
        },
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
                logoURI:
                    'https://coin-images.coingecko.com/coins/images/6319/large/USD_Coin_icon.png',
            },
        },
    },

    // ── BNB Testnet ───────────────────────────────────────────────────────────
    {
        chainId: 97,
        name: 'BNB Smart Chain Testnet',
        networkType: 'testnet',
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
            logoURI:
                'https://coin-images.coingecko.com/coins/images/825/large/bnb-icon2_2x.png',
            wrappedAddress: '0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd',
            coingeckoId: 'binancecoin',
        },
        logoURI:
            'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/binance/info/logo.png',
        coingeckoPlatform: 'bnb',
        tokenListSource: 'pancakeswap',
        tokens: {
            USDC: '0x64544969ed7EBf5f083679233325356EbE738930',
            WBNB: '0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd',
        },
        testnetTokenMetadata: {
            '0xae13d989dac2f0debff460ac112a837c89baa7cd': {
                name: 'Wrapped BNB',
                symbol: 'WBNB',
                decimals: 18,
                logoURI:
                    'https://coin-images.coingecko.com/coins/images/825/large/bnb-icon2_2x.png',
            },
            '0x64544969ed7ebf5f083679233325356ebe738930': {
                name: 'USD Coin',
                symbol: 'USDC',
                decimals: 18,
                logoURI:
                    'https://coin-images.coingecko.com/coins/images/6319/large/USD_Coin_icon.png',
            },
        },
    },

    // ── Amoy (Polygon Testnet) ────────────────────────────────────────────────
    {
        chainId: 80002,
        name: 'Amoy',
        networkType: 'testnet',
        slug: 'polygon',
        rpcUrl: 'https://rpc-amoy.polygon.technology',
        blockExplorerUrl: 'https://www.oklink.com/amoy',
        nativeCurrency: {
            name: 'MATIC',
            symbol: 'MATIC',
            decimals: 18,
            logoURI:
                'https://coin-images.coingecko.com/coins/images/4713/large/matic-token-icon.png',
            wrappedAddress: '0x9c3C9283D3e44854697Cd22D3Faa240Cfb032889',
            coingeckoId: 'matic-network',
        },
        logoURI:
            'https://coin-images.coingecko.com/coins/images/4713/large/matic-token-icon.png',
        coingeckoPlatform: 'polygon-pos',
        tokenListSource: 'uniswap',
        tokens: {
            USDC: '0x41E94Eb019C0762f9Bfcf9Fb1C3F3ffc1991a9E9',
            WMATIC: '0x9c3C9283D3e44854697Cd22D3Faa240Cfb032889',
        },
        testnetTokenMetadata: {
            '0x9c3c9283d3e44854697cd22d3faa240cfb032889': {
                name: 'Wrapped Matic',
                symbol: 'WMATIC',
                decimals: 18,
                logoURI:
                    'https://coin-images.coingecko.com/coins/images/4713/large/matic-token-icon.png',
            },
            '0x41e94eb019c0762f9bfcf9fb1c3f3ffc1991a9e9': {
                name: 'USD Coin',
                symbol: 'USDC',
                decimals: 6,
                logoURI:
                    'https://coin-images.coingecko.com/coins/images/6319/large/USD_Coin_icon.png',
            },
        },
    },
];


const BY_CHAIN_ID = new Map<number, ChainConfig>(
    CHAIN_REGISTRY.map(c => [c.chainId, c])
);


const BY_SLUG = new Map<string, ChainConfig>(
    CHAIN_REGISTRY.map(c => [`${c.slug}:${c.networkType}`, c])
);

export function getChainById(chainId: number): ChainConfig | undefined {
    return BY_CHAIN_ID.get(chainId);
}


export function getChainBySlug(
    slug: string,
    networkType: NetworkType
): ChainConfig | undefined {
    return BY_SLUG.get(`${slug}:${networkType}`);
}


export function getChainsForNetwork(networkType: NetworkType): ChainConfig[] {
    return CHAIN_REGISTRY.filter(c => c.networkType === networkType);
}


export const MAINNET_CHAINS = getChainsForNetwork('mainnet');


export const TESTNET_CHAINS = getChainsForNetwork('testnet');


export function buildEIP155Namespace(networkType: NetworkType) {
    const chains = getChainsForNetwork(networkType).map(c => `eip155:${c.chainId}`);
    return {
        methods: ['eth_sendTransaction', 'eth_signTypedData_v4', 'personal_sign'],
        chains,
        events: ['chainChanged', 'accountsChanged'],
    };
}


export function getChainConfig(chainId: number, _network?: NetworkType): ChainConfig | undefined {
    return getChainById(chainId);
}


export function getChainName(chainId: number, network?: NetworkType): string {
    return getChainById(chainId)?.name ?? 'Unknown';
}


export function getChainNativeSymbol(chainId: number): string {
    return getChainById(chainId)?.nativeCurrency.symbol ?? 'ETH';
}


export function getExplorerUrl(
    chainId: number,
    _network: NetworkType,
    type: 'tx' | 'block' | 'address',
    value: string
): string {
    const base = getChainById(chainId)?.blockExplorerUrl ?? 'https://etherscan.io';
    return `${base}/${type}/${value}`;
}

export function getChainLogoUrl(chainId: number, _network?: NetworkType): string | undefined {
    return getChainById(chainId)?.logoURI;
}

export function getTokenAddress(
    chainId: number,
    symbol: keyof WellKnownTokens
): string | undefined {
    return getChainById(chainId)?.tokens[symbol];
}

export type ChainType = string;


export function getEVMChains(network: NetworkType) {
    return getChainsForNetwork(network).map(c => ({
        chainId: c.chainId,
        name: c.name,
        rpcUrl: c.rpcUrl,
        fallbackRpcUrls: c.fallbackRpcUrls,
        nativeCurrency: {
            name: c.nativeCurrency.name,
            symbol: c.nativeCurrency.symbol,
            decimals: c.nativeCurrency.decimals,
        },
        blockExplorerUrl: c.blockExplorerUrl,
        logoUrl: c.logoURI,
    }));
}


export function chainTypeToId(
    slug: string,
    network: NetworkType
): number {
    return getChainBySlug(slug, network)?.chainId ?? 1;
}


export function normalizeChainId(chainId: unknown): number {
    if (typeof chainId === 'number') return chainId;
    if (typeof chainId === 'string') {
        if (chainId.startsWith('0x')) return parseInt(chainId, 16);
        const n = parseInt(chainId, 10);
        return isNaN(n) ? 1 : n;
    }
    return 1;
}

export function getCoinGeckoPlatform(chainId: number): string | undefined {
    return getChainById(chainId)?.coingeckoPlatform;
}


export function getTestnetTokenMetadata(
    chainId: number,
    address: string
): { name: string; symbol: string; decimals: number; logoURI?: string } | undefined {
    return getChainById(chainId)?.testnetTokenMetadata?.[address.toLowerCase()];
}


export function getSwapRouterAddress(chainId: number): string | undefined {
    return getChainById(chainId)?.swapRouterAddress;
}

export function getSwapConfig(chainId: number) {
    const chain = getChainById(chainId);
    if (!chain) return undefined;
    return {
        chainId: chain.chainId,
        isTestnet: chain.networkType === 'testnet',
        nativeSymbol: chain.nativeCurrency.symbol,
        wNative: chain.nativeCurrency.wrappedAddress,
        usdt: chain.tokens.USDT ?? '',
        usdc: chain.tokens.USDC ?? '',
        swapRouter: chain.swapRouterAddress ?? '',
    };
}