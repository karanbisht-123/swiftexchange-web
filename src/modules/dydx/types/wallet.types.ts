export type DydxNetwork = 'mainnet' | 'testnet';

export interface DydxAddress {
  address: string;
  publicKey: string;
}

export interface DydxWalletState {
  isConnected: boolean;
  network: DydxNetwork;
  address: string | null;
  publicKey: string | null;
  mnemonic: string | null;
}

export interface DydxNetworkConfig {
  indexerUrl: string;
  validatorUrl: string;
  chainId: string;
  wsUrl: string;
}

// export const DYDX_NETWORKS: Record<DydxNetwork, DydxNetworkConfig> = {
//   mainnet: {
//     indexerUrl: 'https://indexer.dydx.trade',
//     validatorUrl: 'https://dydx-ops-rpc.kingnodes.com',
//     chainId: 'dydx-mainnet-1',
//     wsUrl: 'wss://indexer.dydx.trade/v4/ws',
//   },
//   testnet: {
//     indexerUrl: 'https://indexer.v4testnet.dydx.exchange',
//     validatorUrl: 'https://dydx-testnet-rpc.kingnodes.com',
//     chainId: 'dydx-testnet-4',
//     wsUrl: 'wss://indexer.v4testnet.dydx.exchange/v4/ws',
//   },
// };

export interface DydxPosition {
  market: string;
  side: 'LONG' | 'SHORT';
  size: string;
  entryPrice: string;
  unrealizedPnl: string;
  realizedPnl: string;
}

export interface DydxBalance {
  denom: string;
  amount: string;
}

export interface DydxMarket {
  ticker: string;
  oraclePrice: string;
  priceChange24h: string;
  volume24h: string;
  trades24h: number;
  nextFundingRate: string;
}

export interface DydxSubaccount {
  address: string;
  subaccountNumber: number;
  equity: string;
  freeCollateral: string;
  marginUsage: string;
}

export interface DydxFill {
  id: string;
  side: 'BUY' | 'SELL';
  liquidity: string;
  type: string;
  market: string;
  price: string;
  size: string;
  fee: string;
  createdAt: string;
  orderId?: string;
}
