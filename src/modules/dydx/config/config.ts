// import { IndexerConfig, Network } from "@dydxprotocol/v4-client-js";

export const DYDX_CONFIG: any = {
  apiUrl: import.meta.env.VITE_DYDX_INDEXER_REST || 'https://indexer.v4testnet.dydx.exchange',
  indexerWs: import.meta.env.VITE_DYDX_INDEXER_WS || 'wss://indexer.v4testnet.dydx.exchange/v4/ws',
  chainId: import.meta.env.VITE_DYDX_CHAIN_ID || 'dydx-testnet-4',
  network: import.meta.env.VITE_DYDX_NETWORK || 'testnet',
};

// For validator (on-chain queries if needed later)
export const VALIDATOR_URL =
  import.meta.env.VITE_DYDX_VALIDATOR_REST || 'https://test-dydx-rpc.kingnodes.com';
