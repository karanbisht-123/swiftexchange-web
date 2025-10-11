import { IndexerClient, Network } from '@dydxprotocol/v4-client-js';

import { DYDX_CONFIG } from '../config/config';
import { type MessageHandler, webSocketManager } from '../utils/WebSocketManager';

// Singleton for IndexerClient (REST)
let indexerClient: IndexerClient | null = null;

export const getIndexerClient = (): IndexerClient => {
  if (!indexerClient) {
    const network = Network.testnet();
    indexerClient = new IndexerClient({
      ...network.indexerConfig,
      ...DYDX_CONFIG,
    });
  }
  return indexerClient;
};

// WebSocket client using WebSocketManager
export const getSocketClient = () => {
  const manager = webSocketManager;

  return {
    connect: async () => {
      await manager.connect();
    },

    subscribeToOrderbook: (market: string, handler: MessageHandler) => {
      return manager.subscribe('v4_orderbook', handler, market, false);
    },

    subscribeToTrades: (market: string, handler: MessageHandler) => {
      return manager.subscribe('v4_trades', handler, market, false);
    },

    subscribeToMarkets: (handler: MessageHandler) => {
      return manager.subscribe('v4_markets', handler, undefined, false);
    },

    subscribeToCandles: (market: string, resolution: string, handler: MessageHandler) => {
      return manager.subscribe('v4_candles', handler, `${market}/${resolution}`, false);
    },

    subscribeToSubaccounts: (
      address: string,
      subaccountNumber: number,
      handler: MessageHandler
    ) => {
      return manager.subscribe('v4_subaccounts', handler, `${address}/${subaccountNumber}`, false);
    },

    getConnectionStatus: () => manager.getConnectionStatus(),

    getDebugInfo: () => manager.getDebugInfo(),

    disconnect: () => manager.disconnect(),

    onConnect: (handler: () => void) => manager.onConnect(handler),

    onDisconnect: (handler: () => void) => manager.onDisconnect(handler),

    isConnected: () => manager.isConnected(),
  };
};

export type SocketClient = ReturnType<typeof getSocketClient>;
