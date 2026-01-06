import { useEffect, useRef, useState } from 'react';

import {
  CompositeClient,
  IndexerClient,
  Network,
  ValidatorClient,
} from '@dydxprotocol/v4-client-js';

import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import { type MessageHandler, webSocketManager } from '../utils/WebSocketManager';

let indexerClient: IndexerClient | null = null;
let validatorClient: ValidatorClient | null = null;
let compositeClient: CompositeClient | null = null;
let currentNetwork: 'mainnet' | 'testnet' | null = null;

const getNetworkConfig = (network: 'mainnet' | 'testnet') => {
  return network === 'mainnet' ? Network.mainnet() : Network.testnet();
};

// 🔧 FIXED: Proper reset without triggering unnecessary reconnections
export const resetAllClients = (isLogout = false): void => {
  console.log(`[dYdX Clients] Resetting clients (logout: ${isLogout})`);

  indexerClient = null;
  validatorClient = null;
  compositeClient = null;

  if (isLogout) {
    currentNetwork = null;
    // Only shutdown WebSocket on logout
    webSocketManager.shutdown();
    console.log('[dYdX Clients] All clients fully shut down (logout)');
  } else {
    // On network change, keep currentNetwork for comparison
    console.log('[dYdX Clients] Clients reset due to network change');
  }
};

const checkNetworkChange = (network: 'mainnet' | 'testnet'): boolean => {
  if (currentNetwork && currentNetwork !== network) {
    console.log(
      `[dYdX Client] Network changed from ${currentNetwork} to ${network}, resetting clients...`
    );
    resetAllClients(false);
    return true;
  }
  return false;
};

export const getIndexerClient = (): IndexerClient => {
  const network = useWalletStore.getState().network;

  if (indexerClient && currentNetwork === network) {
    return indexerClient;
  }

  checkNetworkChange(network);
  const networkConfig = getNetworkConfig(network);

  indexerClient = new IndexerClient(networkConfig.indexerConfig);
  currentNetwork = network;
  console.log(`[IndexerClient] Initialized for ${network}`);

  return indexerClient;
};

export const getValidatorClient = async (): Promise<ValidatorClient> => {
  const network = useWalletStore.getState().network;

  if (validatorClient && currentNetwork === network) {
    return validatorClient;
  }

  checkNetworkChange(network);
  const networkConfig = getNetworkConfig(network);

  validatorClient = await ValidatorClient.connect(networkConfig.validatorConfig);
  currentNetwork = network;
  console.log(`[ValidatorClient] Connected to ${network}`);

  return validatorClient;
};

export const getCompositeClient = async (): Promise<CompositeClient> => {
  const network = useWalletStore.getState().network;

  if (compositeClient && currentNetwork === network) {
    return compositeClient;
  }

  checkNetworkChange(network);
  const networkConfig = getNetworkConfig(network);

  compositeClient = await CompositeClient.connect(networkConfig);
  currentNetwork = network;
  console.log(`[CompositeClient] Connected to ${network}`);

  return compositeClient;
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

    subscribeToTrades: (market: string, handler: MessageHandler, batched = false) =>
      webSocketManager.subscribe('v4_trades', handler, market, batched),

    subscribeToMarkets: (handler: MessageHandler, batched = true) =>
      webSocketManager.subscribe('v4_markets', handler, undefined, batched),

    subscribeToCandles: (
      market: string,
      resolution: string,
      handler: MessageHandler,
      batched = false
    ) => webSocketManager.subscribe('v4_candles', handler, `${market}/${resolution}`, batched),

    subscribeToOrderbook: (market: string, handler: MessageHandler, batched = false) =>
      webSocketManager.subscribe('v4_orderbook', handler, market, batched),

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

    subscribeToParentSubaccounts: (
      address: string,
      subaccountNumber: number,
      handler: MessageHandler,
      batched = false
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
  const networkConfig = getNetworkConfig(network);
  webSocketManager.connect(networkConfig.indexerConfig.websocketEndpoint);

  if (currentNetwork !== network) {
    checkNetworkChange(network);
    currentNetwork = network;
    console.log(`[SocketClient] Created for ${network}`);
  }

  return createSocketClient();
};

export type SocketClient = ReturnType<typeof createSocketClient>;

export const useIndexerClient = (): IndexerClient => {
  const network = useWalletStore(s => s.network);
  const [client, setClient] = useState<IndexerClient>(getIndexerClient());

  useEffect(() => {
    console.log('[useIndexerClient] Network changed:', network);
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
    console.log('[useValidatorClient] Initializing for network:', network);

    getValidatorClient()
      .then(validatorClient => {
        if (mountedRef.current) {
          setClient(validatorClient);
        } else {
          console.log('[useValidatorClient] Component unmounted, ignoring result');
        }
      })
      .catch(error => {
        console.error('[useValidatorClient] Connection failed:', error);
        if (mountedRef.current) {
          setClient(null);
        }
      });

    return () => {
      console.log('[useValidatorClient] Cleanup on unmount');
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
    console.log('[useCompositeClient] Initializing for network:', network);

    getCompositeClient()
      .then(compositeClient => {
        if (mountedRef.current) {
          setClient(compositeClient);
        } else {
          console.log('[useCompositeClient] Component unmounted, ignoring result');
        }
      })
      .catch(error => {
        console.error('[useCompositeClient] Connection failed:', error);
        if (mountedRef.current) {
          setClient(null);
        }
      });

    return () => {
      console.log('[useCompositeClient] Cleanup on unmount');
      mountedRef.current = false;
    };
  }, [network]);

  return client;
};

// 🔧 FIXED: Proper WebSocket subscription cleanup
export const useSocketClient = (): SocketClient => {
  const network = useWalletStore(s => s.network);
  const [client, setClient] = useState<SocketClient>(() => getSocketClient());
  const networkRef = useRef(network);

  useEffect(() => {
    // Only recreate client if network actually changed
    if (networkRef.current !== network) {
      console.log('[useSocketClient] Network changed from', networkRef.current, 'to', network);
      networkRef.current = network;

      // Get new client for new network
      setClient(getSocketClient());
    }

    // No cleanup needed here - subscriptions are cleaned up by components using the client
  }, [network]);

  return client;
};

export const getConnectionHealth = () => {
  return {
    socketStatus: webSocketManager.getConnectionStatus(),
    socketDebug: webSocketManager.getDebugInfo(),
    currentNetwork,
    clients: {
      indexer: indexerClient !== null,
      validator: validatorClient !== null,
      composite: compositeClient !== null,
    },
  };
};

export const logoutAndShutdown = () => {
  console.log('[Clients] Logout initiated');
  resetAllClients(true);
};
