import { useEffect, useState } from 'react';

import {
  CompositeClient,
  IndexerClient,
  Network,
  ValidatorClient,
} from '@dydxprotocol/v4-client-js';

import { getNetwork } from '../../walletconnect/config/chains';
import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import { getDydxConfig } from '../config/config';
import { type MessageHandler, webSocketManager } from '../utils/WebSocketManager';

// Singleton clients with network tracking
let indexerClient: IndexerClient | null = null;
let validatorClient: ValidatorClient | null = null;
let compositeClient: CompositeClient | null = null;
let socketClientInstance: ReturnType<typeof createSocketClient> | null = null;
let currentNetwork: 'mainnet' | 'testnet' | null = null;

/**
 * Get current network from wallet store
 */
const getCurrentNetwork = (): 'mainnet' | 'testnet' => {
  const network = getNetwork();
  console.log('[getCurrentNetwork] Retrieved network from store:', network);
  return network;
};

/**
 * Reset all clients when network changes
 */
export const resetAllClients = (): void => {
  indexerClient = null;
  validatorClient = null;
  compositeClient = null;
  socketClientInstance = null;
  currentNetwork = null;
  webSocketManager.disconnect();
  console.log('[dYdX Clients] All clients reset due to network change');
};

/**
 * Get or create IndexerClient for current network
 */
export const getIndexerClient = (): IndexerClient => {
  const network = getCurrentNetwork();

  // Return existing client if network hasn't changed
  if (indexerClient && currentNetwork === network) {
    return indexerClient;
  }

  // Network changed, reset and create new client
  if (currentNetwork && currentNetwork !== network) {
    console.log(
      `[IndexerClient] Network changed from ${currentNetwork} to ${network}, resetting...`
    );
    resetAllClients();
  }

  const config = getDydxConfig(network);

  indexerClient = new IndexerClient({
    restEndpoint: config.apiUrl,
    websocketEndpoint: config.indexerWs,
  });

  currentNetwork = network;
  console.log(`[IndexerClient] Initialized for ${network}: ${config.apiUrl}`);

  return indexerClient;
};

/**
 * Get or create ValidatorClient for current network
 */
export const getValidatorClient = async (): Promise<ValidatorClient> => {
  const network = getCurrentNetwork();

  // Return existing client if network hasn't changed
  if (validatorClient && currentNetwork === network) {
    return validatorClient;
  }

  // Network changed, reset and create new client
  if (currentNetwork && currentNetwork !== network) {
    console.log(
      `[ValidatorClient] Network changed from ${currentNetwork} to ${network}, resetting...`
    );
    resetAllClients();
  }

  const networkConfig = network === 'mainnet' ? Network.mainnet() : Network.testnet();

  validatorClient = await ValidatorClient.connect(networkConfig.validatorConfig);
  currentNetwork = network;
  console.log(`[ValidatorClient] Connected to ${network}`);

  return validatorClient;
};

/**
 * Get or create CompositeClient for current network
 */
export const getCompositeClient = async (): Promise<CompositeClient> => {
  const network = getCurrentNetwork();

  // Return existing client if network hasn't changed
  if (compositeClient && currentNetwork === network) {
    return compositeClient;
  }

  // Network changed, reset and create new client
  if (currentNetwork && currentNetwork !== network) {
    console.log(
      `[CompositeClient] Network changed from ${currentNetwork} to ${network}, resetting...`
    );
    resetAllClients();
  }

  const networkConfig = network === 'mainnet' ? Network.mainnet() : Network.testnet();

  compositeClient = await CompositeClient.connect(networkConfig);
  currentNetwork = network;
  console.log(`[CompositeClient] Connected to ${network}`);

  return compositeClient;
};

/**
 * Create socket client with WebSocket manager
 */
const createSocketClient = () => {
  const network = getCurrentNetwork();
  const config = getDydxConfig(network);

  // Disconnect existing connection and reconnect with new config
  webSocketManager.disconnect();
  setTimeout(() => webSocketManager.connect(config.indexerWs), 100);

  return {
    connect: () => webSocketManager.connect(config.indexerWs),

    subscribeToOrderbook: (market: string, handler: MessageHandler, batched = false) =>
      webSocketManager.subscribe('v4_orderbook', handler, market, batched),

    subscribeToTrades: (market: string, handler: MessageHandler, batched = false) =>
      webSocketManager.subscribe('v4_trades', handler, market, batched),

    subscribeToMarkets: (handler: MessageHandler, batched = true) =>
      webSocketManager.subscribe('v4_markets', handler, undefined, batched),

    subscribeToCandles: (
      market: string,
      resolution: string,
      handler: MessageHandler,
      batched = true
    ) => webSocketManager.subscribe('v4_candles', handler, `${market}/${resolution}`, batched),

    subscribeToSubaccounts: (
      address: string,
      subaccountNumber: number,
      handler: MessageHandler,
      batched = false
    ) =>
      webSocketManager.subscribe(
        'v4_subaccounts',
        handler,
        `${address}/${subaccountNumber}`,
        batched
      ),

    getConnectionStatus: () => webSocketManager.getConnectionStatus(),
    getDebugInfo: () => webSocketManager.getDebugInfo(),
    isConnected: () => webSocketManager.isConnected(),
    disconnect: () => webSocketManager.disconnect(),
    onConnect: (cb: () => void) => webSocketManager.onConnect(cb),
    onDisconnect: (cb: () => void) => webSocketManager.onDisconnect(cb),
  };
};

/**
 * Get or create SocketClient for current network
 */
export const getSocketClient = () => {
  const network = getCurrentNetwork();

  // Return existing client if network hasn't changed
  if (socketClientInstance && currentNetwork === network) {
    return socketClientInstance;
  }

  // Network changed, reset and create new client
  if (currentNetwork && currentNetwork !== network) {
    console.log(
      `[SocketClient] Network changed from ${currentNetwork} to ${network}, resetting...`
    );
    resetAllClients();
  }

  socketClientInstance = createSocketClient();
  currentNetwork = network;
  console.log(`[SocketClient] Created for ${network}`);

  return socketClientInstance;
};

export type SocketClient = ReturnType<typeof createSocketClient>;

/**
 * React Hook: Get IndexerClient that responds to network changes
 */
export const useIndexerClient = (): IndexerClient => {
  const network = useWalletStore(s => s.network);
  const [client, setClient] = useState<IndexerClient>(() => getIndexerClient());

  useEffect(() => {
    console.log(`[useIndexerClient] Network changed to ${network}, resetting clients...`);
    resetAllClients();
    setClient(getIndexerClient());
  }, [network]);

  return client;
};

/**
 * React Hook: Get ValidatorClient that responds to network changes
 */
export const useValidatorClient = (): ValidatorClient | null => {
  const network = useWalletStore(s => s.network);
  const [client, setClient] = useState<ValidatorClient | null>(null);

  useEffect(() => {
    console.log(`[useValidatorClient] Network changed to ${network}, resetting clients...`);
    resetAllClients();

    getValidatorClient().then(vc => {
      setClient(vc);
    });
  }, [network]);

  return client;
};

/**
 * React Hook: Get CompositeClient that responds to network changes
 */
export const useCompositeClient = (): CompositeClient | null => {
  const network = useWalletStore(s => s.network);
  const [client, setClient] = useState<CompositeClient | null>(null);

  useEffect(() => {
    console.log(`[useCompositeClient] Network changed to ${network}, resetting clients...`);
    resetAllClients();

    getCompositeClient().then(cc => {
      setClient(cc);
    });
  }, [network]);

  return client;
};

/**
 * React Hook: Get SocketClient that responds to network changes
 */
export const useSocketClient = (): SocketClient => {
  const network = useWalletStore(s => s.network);
  const [client, setClient] = useState<SocketClient>(() => getSocketClient());

  useEffect(() => {
    console.log(`[useSocketClient] Network changed to ${network}, resetting clients...`);
    resetAllClients();
    setClient(getSocketClient());

    // Cleanup on unmount
    return () => {
      if (useWalletStore.getState().network !== network) {
        webSocketManager.disconnect();
      }
    };
  }, [network]);

  return client;
};
