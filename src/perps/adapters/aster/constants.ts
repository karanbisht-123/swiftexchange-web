export const IS_ASTER_TESTNET = false;

export const ASTER_REST_URL = IS_ASTER_TESTNET
  ? 'https://fapi.asterdex-testnet.com'
  : 'https://fapi.asterdex.com';

export const ASTER_SPOT_REST_URL = IS_ASTER_TESTNET
  ? 'https://sapi.asterdex-testnet.com'
  : 'https://sapi.asterdex.com';

export const ASTER_WS_URL = IS_ASTER_TESTNET
  ? 'wss://fstream.asterdex-testnet.com/ws'
  : 'wss://fstream.asterdex.com/ws';

export const ASTER_BAPI_URL = IS_ASTER_TESTNET
  ? 'https://www.asterdex-testnet.com/bapi/futures/v1/public/future'
  : 'https://www.asterdex.com/bapi/futures/v1/public/future';

export const ASTER_CHAIN_ID = 1666;

export const EVM_CHAINS: Record<
  number,
  { id: number; name: string; symbol: string; chainName: string; explorer: string }
> = {
  1: { id: 1, name: 'Ethereum', symbol: 'ETH', chainName: 'ETH', explorer: 'https://etherscan.io' },
  56: {
    id: 56,
    name: 'BNB Smart Chain',
    symbol: 'BNB',
    chainName: 'BSC',
    explorer: 'https://bscscan.com',
  },
  42161: {
    id: 42161,
    name: 'Arbitrum One',
    symbol: 'ARB',
    chainName: 'Arbitrum',
    explorer: 'https://arbiscan.io',
  },
};

export const ASTER_DEPOSIT_BRIDGES: Record<number, string> = {
  56: '0x128463A60784c4D3f46c23Af3f65Ed859Ba87974', // BNB Chain
  42161: '0x9E36CB86a159d479cEd94Fa05036f235Ac40E1d5', // Arbitrum
  1: '0x604DD02d620633Ae427888d41bfd15e38483736E', // Ethereum
};

export function getAsterDepositBridge(chainId: number): string {
  const bridge = ASTER_DEPOSIT_BRIDGES[chainId];
  if (!bridge) {
    throw new Error(`Unsupported EVM chain ${chainId} for Aster deposits.`);
  }
  return bridge;
}

export const BAPI_ENDPOINTS = {
  FUNDING_HISTORY: '/common/get-funding-rate-history',
  SYMBOL_DETAIL: '/../composite/market/symbol/detail',
  SYMBOL_ATHL: '/../composite/market/symbol/crypto/athl',
  BRACKETS: '/../../friendly/future/common/brackets',
  REAL_TIME_FUNDING_RATE: '/common/real-time-funding-rate',
} as const;

export const ASTER_ENDPOINTS = {
  // Public
  TIME: '/fapi/v3/time',
  EXCHANGE_INFO: '/fapi/v3/exchangeInfo',
  TICKER_24HR: '/fapi/v1/ticker/24hr',
  DEPTH: '/fapi/v3/depth',
  KLINES: '/fapi/v3/klines',
  AGG_TRADES: '/fapi/v3/aggTrades',
  FUNDING_RATE: '/fapi/v3/fundingRate',
  FUNDING_INFO: '/fapi/v3/fundingInfo',

  // Account & Auth
  LISTEN_KEY: '/fapi/v3/listenKey',
  ACCOUNT: '/fapi/v3/account',
  BALANCE: '/fapi/v3/balance',
  POSITION_RISK: '/fapi/v3/positionRisk',
  LEVERAGE: '/fapi/v3/leverage',
  LEVERAGE_BRACKET: '/fapi/v3/leverageBracket',
  MARGIN_TYPE: '/fapi/v3/marginType',
  POSITION_MARGIN: '/fapi/v3/positionMargin',
  MULTI_ASSETS_MARGIN: '/fapi/v3/multiAssetsMargin',
  INCOME: '/fapi/v3/income',

  // Orders & Trades
  ORDER: '/fapi/v3/order',
  CHASE: '/fapi/v3/chase',
  BATCH_ORDERS: '/fapi/v3/batchOrders',
  ALL_OPEN_ORDERS: '/fapi/v3/allOpenOrders',
  OPEN_ORDERS: '/fapi/v3/openOrders',
  ALL_ORDERS: '/fapi/v3/allOrders',
  USER_TRADES: '/fapi/v3/userTrades',

  // Deposit & Withdraw
  DEPOSIT_ADDRESS: '/fapi/v3/deposit/address',
  DEPOSIT_HISTORY: '/fapi/v3/deposit/history',
  WITHDRAW: '/fapi/v3/withdraw',
  WITHDRAW_HISTORY: '/fapi/v3/withdraw/history',
  ASTER_USER_WITHDRAW_INFO: '/fapi/v3/aster/user-withdraw-info',
  ASTER_USER_WITHDRAW: '/fapi/v3/aster/user-withdraw',
  DEPOSIT_WITHDRAW_HISTORY: '/fapi/v3/aster/deposit-withdraw-history',
} as const;

export const ASTER_WS_STREAMS = {
  TICKER: '!ticker@arr',
  MARK_PRICE: '!markPrice@arr@1s',
} as const;
