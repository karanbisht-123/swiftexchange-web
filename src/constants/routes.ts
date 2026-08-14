export const ROUTES = {
  HOME: '/',
  DASHBOARD: '/dashboard',
  MY_ASSETS: '/my-assets',
  SEND: '/send',
  RECEIVE: '/receive',
  TRADING_STELLAR: '/trading/stellar',
  TRANSACTIONS: '/transactions',
  TRADING_EVM_SWAP: '/trading/swap',
  TRADING_EVM_FIAT: '/trading/evm/fiat',
  // TRADING_DYDX_FUTURES: '/trade/perpetuals',
  TRADING_PERPS: '/trade/perpetuals',
  MARKETS: '/markets',
  PORTFOLIO: '/stellar/portfolio',
  SETTINGS: '/settings',
} as const;

export type RouteKey = keyof typeof ROUTES;
export type RouteValue = (typeof ROUTES)[RouteKey];
