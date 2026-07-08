import { useEffect, useRef, useState } from 'react';

import {
  CompositeClient,
  IndexerClient,
  Network,
  ValidatorClient,
} from '@dydxprotocol/v4-client-js';

import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import { type MessageHandler, webSocketManager } from '../utils/WebSocketManager';

interface ClientCache {
  indexer: IndexerClient | null;
  validator: ValidatorClient | null;
  composite: CompositeClient | null;
  validatorPromise: Promise<ValidatorClient> | null;
  compositePromise: Promise<CompositeClient> | null;
  network: 'mainnet' | 'testnet' | null;
}

let socketClientInstance: ReturnType<typeof createSocketClient> | null = null;
let socketClientNetwork: string | null = null;

const cache: ClientCache = {
  indexer: null,
  validator: null,
  composite: null,
  validatorPromise: null,
  compositePromise: null,
  network: null,
};

const getNetworkConfig = (network: 'mainnet' | 'testnet') => {
  return network === 'mainnet' ? Network.mainnet() : Network.testnet();
};

export const resetAllClients = (isLogout = false): void => {
  cache.indexer = null;
  cache.validator = null;
  cache.composite = null;
  cache.validatorPromise = null;
  cache.compositePromise = null;
  socketClientInstance = null;
  socketClientNetwork = null;
  webSocketManager.shutdown();

  if (isLogout) {
    cache.network = null;
  }
};

const invalidateCacheForNetworkSwitch = (newNetwork: 'mainnet' | 'testnet'): boolean => {
  if (cache.network && cache.network !== newNetwork) {
    resetAllClients(false);
    return true;
  }
  return false;
};

export const getIndexerClient = (): IndexerClient => {
  const network = useWalletStore.getState().network;

  if (cache.indexer && cache.network === network) {
    return cache.indexer;
  }

  invalidateCacheForNetworkSwitch(network);
  const networkConfig = getNetworkConfig(network);

  cache.indexer = new IndexerClient(networkConfig.indexerConfig);
  cache.network = network;

  return cache.indexer;
};

export const getValidatorClient = async (): Promise<ValidatorClient> => {
  const network = useWalletStore.getState().network;

  if (cache.validator && cache.network === network) {
    return cache.validator;
  }
  if (cache.validatorPromise && cache.network === network) {
    return cache.validatorPromise;
  }

  invalidateCacheForNetworkSwitch(network);
  const networkConfig = getNetworkConfig(network);

  cache.validatorPromise = ValidatorClient.connect(networkConfig.validatorConfig);
  try {
    const client = await cache.validatorPromise;
    cache.validator = client;
    cache.network = network;
    return client;
  } finally {
    cache.validatorPromise = null;
  }
};

export const getCompositeClient = async (): Promise<CompositeClient> => {
  const network = useWalletStore.getState().network;

  if (cache.composite && cache.network === network) {
    return cache.composite;
  }
  if (cache.compositePromise && cache.network === network) {
    return cache.compositePromise;
  }

  invalidateCacheForNetworkSwitch(network);
  const networkConfig = getNetworkConfig(network);

  cache.compositePromise = CompositeClient.connect(networkConfig);
  try {
    const client = await cache.compositePromise;
    cache.composite = client;
    cache.network = network;
    return client;
  } finally {
    cache.compositePromise = null;
  }
};

const createSocketClient = () => {
  const network = useWalletStore.getState().network;
  const networkConfig = getNetworkConfig(network);
  const wsEndpoint = networkConfig.indexerConfig.websocketEndpoint;

  webSocketManager.connect(wsEndpoint).catch(error => {
    console.error('[SocketClient] Initial connection failed:', error);
  });

  return {
    connect: () => webSocketManager.connect(wsEndpoint),

    subscribeToTrades: (market: string, handler: MessageHandler, batched = true) =>
      webSocketManager.subscribe('v4_trades', handler, market, batched),

    subscribeToMarkets: (handler: MessageHandler, batched = true) =>
      webSocketManager.subscribe('v4_markets', handler, undefined, batched),

    subscribeToCandles: (
      market: string,
      resolution: string,
      handler: MessageHandler,
      batched = true
    ) => webSocketManager.subscribe('v4_candles', handler, `${market}/${resolution}`, batched),

    subscribeToOrderbook: (market: string, handler: MessageHandler, batched = true) =>
      webSocketManager.subscribe('v4_orderbook', handler, market, batched),

    subscribeToParentSubaccounts: (
      address: string,
      subaccountNumber: number,
      handler: MessageHandler,
      batched = true
    ) =>
      webSocketManager.subscribe(
        'v4_parent_subaccounts',
        handler,
        `${address}/${subaccountNumber}`,
        batched
      ),

    subscribeToBlockHeight: (handler: MessageHandler, batched = true) =>
      webSocketManager.subscribe('v4_block_height', handler, undefined, batched),

    getConnectionStatus: () => webSocketManager.getConnectionStatus(),
    getDebugInfo: () => webSocketManager.getDebugInfo(),
    isConnected: () => webSocketManager.isConnected(),

    onConnect: (cb: () => void) => webSocketManager.onConnect(cb),
    onDisconnect: (cb: () => void) => webSocketManager.onDisconnect(cb),
  };
};

export const getSocketClient = () => {
  const network = useWalletStore.getState().network;

  if (socketClientInstance && socketClientNetwork === network) {
    return socketClientInstance;
  }

  if (cache.network !== network) {
    invalidateCacheForNetworkSwitch(network);
    cache.network = network;
  }

  socketClientInstance = createSocketClient();
  socketClientNetwork = network;
  return socketClientInstance;
};

export type SocketClient = ReturnType<typeof createSocketClient>;

export const useIndexerClient = (): IndexerClient => {
  const network = useWalletStore(s => s.network);
  const [client, setClient] = useState<IndexerClient>(getIndexerClient);

  useEffect(() => {
    setClient(getIndexerClient());
  }, [network]);

  return client;
};

export const useValidatorClient = (): ValidatorClient | null => {
  const network = useWalletStore(s => s.network);
  const [client, setClient] = useState<ValidatorClient | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const targetNetwork = network;

    getValidatorClient()
      .then(validatorClient => {
        if (!mountedRef.current) return;
        if (useWalletStore.getState().network !== targetNetwork) return;
        setClient(validatorClient);
      })
      .catch(error => {
        console.error('[useValidatorClient] Connection failed:', error);
        if (mountedRef.current) setClient(null);
      });

    return () => {
      mountedRef.current = false;
    };
  }, [network]);

  return client;
};

export const useCompositeClient = (): CompositeClient | null => {
  const network = useWalletStore(s => s.network);
  const [client, setClient] = useState<CompositeClient | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const targetNetwork = network;

    getCompositeClient()
      .then(compositeClient => {
        if (!mountedRef.current) return;
        if (useWalletStore.getState().network !== targetNetwork) return;
        setClient(compositeClient);
      })
      .catch(error => {
        console.error('[useCompositeClient] Connection failed:', error);
        if (mountedRef.current) setClient(null);
      });

    return () => {
      mountedRef.current = false;
    };
  }, [network]);

  return client;
};

export const useSocketClient = (): SocketClient => {
  const network = useWalletStore(s => s.network);
  const [client, setClient] = useState<SocketClient>(() => getSocketClient());
  const networkRef = useRef(network);

  useEffect(() => {
    if (networkRef.current !== network) {
      networkRef.current = network;
      setClient(getSocketClient());
    }
  }, [network]);

  return client;
};

export const getConnectionHealth = () => {
  return {
    socketStatus: webSocketManager.getConnectionStatus(),
    socketDebug: webSocketManager.getDebugInfo(),
    currentNetwork: cache.network,
    clients: {
      indexer: cache.indexer !== null,
      validator: cache.validator !== null,
      composite: cache.composite !== null,
    },
  };
};

export const logoutAndShutdown = () => {
  resetAllClients(true);
};

// Eagerly initialize socket client to start WebSocket connection ASAP on app startup
setTimeout(() => {
  try {
    getSocketClient();
  } catch (err) {
    console.error('[SocketClient] Eager connection failed:', err);
  }
}, 0);
