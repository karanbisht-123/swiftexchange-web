export const IS_ASTER_TESTNET = false;
//IS_ASTER_TESTNET ? 714 :
export const ASTER_REST_URL = IS_ASTER_TESTNET
  ? 'https://fapi.asterdex-testnet.com'
  : 'https://fapi.asterdex.com';

export const ASTER_WS_URL = IS_ASTER_TESTNET
  ? 'wss://fstream.asterdex-testnet.com/ws'
  : 'wss://fstream.asterdex.com/ws';

export const ASTER_BAPI_URL = IS_ASTER_TESTNET
  ? 'https://www.asterdex-testnet.com/bapi/futures/v1/public/future'
  : 'https://www.asterdex.com/bapi/futures/v1/public/future';

export const ASTER_CHAIN_ID = 1666;

export const BAPI_ENDPOINTS = {
  FUNDING_HISTORY: '/common/get-funding-rate-history',
  SYMBOL_DETAIL: '/../composite/market/symbol/detail', // relative to ASTER_BAPI_URL which ends in /future
  SYMBOL_ATHL: '/../composite/market/symbol/crypto/athl',
  BRACKETS: '/../../friendly/future/common/brackets',
  REAL_TIME_FUNDING_RATE: '/common/real-time-funding-rate',
} as const;


export const ASTER_ENDPOINTS = {
  // Public
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
} as const;

export const ASTER_WS_STREAMS = {
  TICKER: '!ticker@arr',
  MARK_PRICE: '!markPrice@arr@1s',
} as const;