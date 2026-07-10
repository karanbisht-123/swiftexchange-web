import { CompositeClient } from '@dydxprotocol/v4-client-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useWalletStore } from '../../../walletconnect/store/walletConnectStore';
import { webSocketManager } from '../../utils/WebSocketManager';
import {
  getCompositeClient,
  getConnectionHealth,
  getIndexerClient,
  getSocketClient,
  getValidatorClient,
  logoutAndShutdown,
  resetAllClients,
} from '../clients';

vi.mock('../../../walletconnect/store/walletConnectStore', () => {
  const mockStore = vi.fn(() => 'mainnet');
  (mockStore as any).getState = vi.fn(() => ({ network: 'mainnet' }));
  return {
    useWalletStore: mockStore,
  };
});

vi.mock('../../utils/WebSocketManager', () => ({
  webSocketManager: {
    connect: vi.fn().mockResolvedValue(undefined),
    shutdown: vi.fn(),
    getConnectionStatus: vi.fn(() => 'connected'),
    getDebugInfo: vi.fn(() => ({})),
    isConnected: vi.fn(() => true),
    onConnect: vi.fn(),
    onDisconnect: vi.fn(),
    subscribe: vi.fn(),
  },
}));

vi.mock('@dydxprotocol/v4-client-js', () => {
  class MockIndexerClient {
    config: any;
    constructor(config: any) {
      this.config = config;
    }
  }

  class MockCompositeClient {
    validatorClient = { flag: 'validator' };
    static connect = vi.fn().mockResolvedValue(new MockCompositeClient());
  }

  class MockValidatorConfig {
    endpoint: string;
    chainId: string;
    denoms: any;
    constructor(endpoint: string, chainId: string, denoms: any) {
      this.endpoint = endpoint;
      this.chainId = chainId;
      this.denoms = denoms;
    }
  }

  class MockNetwork {
    name: string;
    indexerConfig: any;
    validatorConfig: any;
    constructor(name: string, indexerConfig: any, validatorConfig: any) {
      this.name = name;
      this.indexerConfig = indexerConfig;
      this.validatorConfig = validatorConfig;
    }
    static mainnet = vi.fn(() => ({
      indexerConfig: { websocketEndpoint: 'wss://mainnet' },
      validatorConfig: { chainId: 'dydx-mainnet-1', denoms: [] },
    }));
    static testnet = vi.fn(() => ({
      indexerConfig: { websocketEndpoint: 'wss://testnet' },
      validatorConfig: { chainId: 'dydx-testnet-1', denoms: [] },
    }));
  }

  return {
    IndexerClient: MockIndexerClient,
    CompositeClient: MockCompositeClient,
    ValidatorConfig: MockValidatorConfig,
    Network: MockNetwork,
  };
});

describe('clients manager', () => {
  beforeEach(() => {
    resetAllClients(true);
    vi.clearAllMocks();
    vi.mocked(useWalletStore.getState).mockReturnValue({ network: 'mainnet' } as any);
  });

  describe('getIndexerClient', () => {
    it('creates and caches indexer client for the active network', () => {
      const client1 = getIndexerClient();
      const client2 = getIndexerClient();
      expect(client1).toBe(client2);
    });

    it('re-creates indexer client when network switches', () => {
      const clientMainnet = getIndexerClient();

      vi.mocked(useWalletStore.getState).mockReturnValue({ network: 'testnet' } as any);
      const clientTestnet = getIndexerClient();

      expect(clientMainnet).not.toBe(clientTestnet);
    });
  });

  describe('getCompositeClient', () => {
    it('creates and caches composite client for the active network', async () => {
      const client1 = await getCompositeClient();
      const client2 = await getCompositeClient();
      expect(client1).toBe(client2);
    });

    it('falls back to default network connection if OEGS composite connection fails', async () => {
      vi.mocked(CompositeClient.connect).mockRejectedValueOnce(new Error('OEGS connection failed'));

      const client = await getCompositeClient();
      expect(client).toBeDefined();
      expect(CompositeClient.connect).toHaveBeenCalledTimes(2); // First oegs, then fallback
    });
  });

  describe('getValidatorClient', () => {
    it('returns the validatorClient of the composite client instance', async () => {
      const validator = await getValidatorClient();
      expect(validator).toEqual({ flag: 'validator' });
    });
  });

  describe('getSocketClient', () => {
    it('instantiates and returns indexer socket helper functions', () => {
      const socket = getSocketClient();
      expect(socket.connect).toBeDefined();
      expect(socket.subscribeToTrades).toBeDefined();
      expect(socket.subscribeToMarkets).toBeDefined();
      expect(socket.subscribeToCandles).toBeDefined();
    });
  });

  describe('resetAllClients and getConnectionHealth', () => {
    it('resets client cache and shut downs active web sockets', () => {
      getIndexerClient();
      expect(getConnectionHealth().clients.indexer).toBe(true);

      resetAllClients(true);
      expect(getConnectionHealth().clients.indexer).toBe(false);
      expect(webSocketManager.shutdown).toHaveBeenCalledTimes(1);
    });

    it('handles logoutAndShutdown action cleanly', () => {
      logoutAndShutdown();
      expect(webSocketManager.shutdown).toHaveBeenCalled();
    });
  });
});
