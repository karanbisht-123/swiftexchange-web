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


let socketClientInstance: ReturnType<typeof createSocketClient> | null = null;
let socketClientNetwork: string | null = null;

const getNetworkConfig = (network: 'mainnet' | 'testnet') => {
  return network === 'mainnet' ? Network.mainnet() : Network.testnet();
};

export const resetAllClients = (isLogout = false): void => {
  indexerClient = null;
  validatorClient = null;
  compositeClient = null;
  socketClientInstance = null;
  socketClientNetwork = null;

  if (isLogout) {
    currentNetwork = null;
    webSocketManager.shutdown();
  }
};

const checkNetworkChange = (network: 'mainnet' | 'testnet'): boolean => {
  if (currentNetwork && currentNetwork !== network) {
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
  if (socketClientInstance && socketClientNetwork === network) {
    return socketClientInstance;
  }

  webSocketManager.connect(networkConfig.indexerConfig.websocketEndpoint).catch(error => {
    console.error('[SocketClient] Connection failed:', error);
  });

  if (currentNetwork !== network) {
    checkNetworkChange(network);
    currentNetwork = network;
  }

  socketClientInstance = createSocketClient();
  socketClientNetwork = network;
  return socketClientInstance;
};

export type SocketClient = ReturnType<typeof createSocketClient>;

export const useIndexerClient = (): IndexerClient => {
  const network = useWalletStore(s => s.network);
  const [client, setClient] = useState<IndexerClient>(getIndexerClient());

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

    getValidatorClient()
      .then(validatorClient => {
        if (mountedRef.current) {
          setClient(validatorClient);
        }
      })
      .catch(error => {
        console.error('[useValidatorClient] Connection failed:', error);
        if (mountedRef.current) {
          setClient(null);
        }
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

    getCompositeClient()
      .then(compositeClient => {
        if (mountedRef.current) {
          setClient(compositeClient);
        }
      })
      .catch(error => {
        console.error('[useCompositeClient] Connection failed:', error);
        if (mountedRef.current) {
          setClient(null);
        }
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
    currentNetwork,
    clients: {
      indexer: indexerClient !== null,
      validator: validatorClient !== null,
      composite: compositeClient !== null,
    },
  };
};

export const logoutAndShutdown = () => {
  resetAllClients(true);
};