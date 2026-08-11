import { useEffect, useRef, useState } from 'react';

import {
  CompositeClient,
  IndexerClient,
  Network,
  ValidatorClient,
  ValidatorConfig,
} from '@dydxprotocol/v4-client-js';

import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import { type MessageHandler, webSocketManager } from '../utils/WebSocketManager';

interface ClientCache {
  indexer: IndexerClient | null;
  composite: CompositeClient | null;
  compositePromise: Promise<CompositeClient> | null;
  network: 'mainnet' | 'testnet' | null;
  activeEndpoint: 'oegs' | 'fallback' | null;
}

let socketClientInstance: ReturnType<typeof createSocketClient> | null = null;
let socketClientNetwork: string | null = null;

const cache: ClientCache = {
  indexer: null,
  composite: null,
  compositePromise: null,
  network: null,
  activeEndpoint: null,
};

// OEGS config
const OEGS_ENDPOINTS: Record<'mainnet' | 'testnet', string> = {
  mainnet: process.env.NEXT_PUBLIC_OEGS_MAINNET_URL || 'https://oegs.dydx.trade',
  testnet: process.env.NEXT_PUBLIC_OEGS_TESTNET_URL || 'https://oegs-testnet.dydx.exchange',
};
const OEGS_ENABLED = process.env.NEXT_PUBLIC_OEGS_ENABLED !== 'false';
const OEGS_CONNECT_TIMEOUT_MS = 3000;

const withTimeout = <T>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
};

const getNetworkConfig = (network: 'mainnet' | 'testnet') => {
  return network === 'mainnet' ? Network.mainnet() : Network.testnet();
};

// OEGS config built from the base network, only the validator endpoint swapped
const getOegsNetworkConfig = (network: 'mainnet' | 'testnet') => {
  const base = getNetworkConfig(network);
  const oegsValidatorConfig = new ValidatorConfig(
    OEGS_ENDPOINTS[network],
    base.validatorConfig.chainId,
    base.validatorConfig.denoms
  );
  return new Network(`${network}-oegs`, base.indexerConfig, oegsValidatorConfig);
};

// Tries OEGS first, falls back to the default node on timeout/error
const connectCompositeWithFallback = async (
  network: 'mainnet' | 'testnet'
): Promise<{ client: CompositeClient; endpoint: 'oegs' | 'fallback' }> => {
  if (OEGS_ENABLED) {
    try {
      const oegsNetwork = getOegsNetworkConfig(network);
      const client = await withTimeout(
        CompositeClient.connect(oegsNetwork),
        OEGS_CONNECT_TIMEOUT_MS,
        'OEGS composite connect'
      );
      console.info(`[dydxClients] CompositeClient connected via OEGS (${network})`);
      return { client, endpoint: 'oegs' };
    } catch (err) {
      console.warn(
        `[dydxClients] OEGS connect failed for ${network}, falling back to default node:`,
        (err as Error).message
      );
    }
  }

  const base = getNetworkConfig(network);
  const client = await CompositeClient.connect(base);
  console.info(`[dydxClients] CompositeClient connected via fallback node (${network})`);
  return { client, endpoint: 'fallback' };
};

export const resetAllClients = (isLogout = false): void => {
  cache.indexer = null;
  cache.composite = null;
  cache.compositePromise = null;
  cache.activeEndpoint = null;
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
  const composite = await getCompositeClient();
  return composite.validatorClient;
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

  // now routes through OEGS-with-fallback instead of connecting directly
  cache.compositePromise = connectCompositeWithFallback(network).then(({ client, endpoint }) => {
    cache.composite = client;
    cache.network = network;
    cache.activeEndpoint = endpoint;
    return client;
  });

  try {
    return await cache.compositePromise;
  } finally {
    cache.compositePromise = null;
  }
};

const createSocketClient = () => {
  const network = useWalletStore.getState().network;
  const networkConfig = getNetworkConfig(network);
  const wsEndpoint = networkConfig.indexerConfig.websocketEndpoint;

  // webSocketManager.connect(wsEndpoint).catch(error => {
  //   console.error('[SocketClient] Initial connection failed:', error);
  // });

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
  const composite = useCompositeClient();
  return composite?.validatorClient ?? null;
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
  // getSocketClient() is a singleton keyed by network; subscribe just for re-renders on switch.
  useWalletStore(s => s.network);
  return getSocketClient();
};

export const getConnectionHealth = () => {
  return {
    socketStatus: webSocketManager.getConnectionStatus(),
    socketDebug: webSocketManager.getDebugInfo(),
    currentNetwork: cache.network,
    activeValidatorEndpoint: cache.activeEndpoint,
    oegsEnabled: OEGS_ENABLED,
    clients: {
      indexer: cache.indexer !== null,
      composite: cache.composite !== null,
    },
  };
};

export const logoutAndShutdown = () => {
  resetAllClients(true);
};

// Eagerly initialize socket client to start WebSocket connection ASAP on app startup
// setTimeout(() => {
//   try {
//     getSocketClient();
//   } catch (err) {
//     console.error('[SocketClient] Eager connection failed:', err);
//   }
// }, 0);
