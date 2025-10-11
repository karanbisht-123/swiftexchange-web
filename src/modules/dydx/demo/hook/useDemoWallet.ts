import { useCallback, useRef, useState } from 'react';

import {
  // IndexerClient,
  CompositeClient,
  IndexerConfig,
  LocalWallet,
  Network,
} from '@dydxprotocol/v4-client-js';

import { DYDX_CONFIG } from '../../config/config';
import {
  DemoWalletHelpers,
  DydxDemoWalletService,
  type SubaccountData,
} from '../DemowalletService';

interface WalletBalance {
  denom: string;
  amount: string;
}

// interface Position {
//   market: string;
//   status: string;
//   side: string;
//   size: string;
//   entryPrice: string;
//   unrealizedPnl: string;
//   realizedPnl: string;
//   netFunding: string;
// }

interface SubaccountBalance {
  equity: string;
  freeCollateral: string;
  marginUsage: string;
  // openPerpetualPositions: Record<string, Position>;
  assetPositions?: any;
  marginEnabled?: boolean;
}

interface WalletState {
  isConnected: boolean;
  isLoading: boolean;
  address: string | null;
  subaccounts: SubaccountData[];
  currentSubaccount: SubaccountData | null;
  balance: WalletBalance | null;
  subaccountBalance: SubaccountBalance | null;
  error: string | null;
}

export function useDemoWallet() {
  const [state, setState] = useState<WalletState>({
    isConnected: false,
    isLoading: false,
    address: null,
    subaccounts: [],
    currentSubaccount: null,
    balance: null,
    subaccountBalance: null,
    error: null,
  });

  const [walletService, setWalletService] = useState<DydxDemoWalletService | null>(null);
  const [compositeClient, setCompositeClient] = useState<CompositeClient | null>(null);

  const isInitializing = useRef(false);

  const connectWallet = useCallback(async () => {
    if (isInitializing.current) {
      console.warn('Wallet connection already in progress');
      return { success: false, error: 'Connection in progress' };
    }

    isInitializing.current = true;
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      const mnemonic = import.meta.env.VITE_DYDX_MNEMONIC;

      if (!mnemonic || typeof mnemonic !== 'string' || mnemonic.trim().split(' ').length < 12) {
        throw new Error('Invalid mnemonic: Must be a valid BIP-39 phrase with 12+ words');
      }

      console.log('🔄 Initializing wallet with config:', DYDX_CONFIG);

      const indexerConfig = new IndexerConfig(DYDX_CONFIG.apiUrl, DYDX_CONFIG.indexerWs);

      const { service, subaccount } = await DemoWalletHelpers.createWithDefaultSubaccount({
        mnemonic,
        indexerConfig,
      });

      const address = service.getWalletAddress();

      const network = DYDX_CONFIG.network === 'testnet' ? Network.testnet() : Network.mainnet();

      console.log('🔄 Connecting to dYdX network...');
      const composite = await CompositeClient.connect(network);
      setCompositeClient(composite);
      setWalletService(service);

      setState(prev => ({
        ...prev,
        isConnected: true,
        isLoading: false,
        address,
        subaccounts: [subaccount],
        currentSubaccount: subaccount,
        error: null,
      }));

      console.log('✅ Wallet connected successfully');
      console.log('📍 Address:', address);
      console.log('💼 Default subaccount:', subaccount.subaccountId);
      console.log('💰 Equity:', subaccount.equity || '0');

      return { success: true, address, subaccount };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to connect wallet';
      setState(prev => ({ ...prev, isLoading: false, error: errorMessage }));
      console.error('❌ Wallet connection failed:', error);
      return { success: false, error: errorMessage };
    } finally {
      isInitializing.current = false;
    }
  }, []);

  const fetchAllSubaccounts = useCallback(async () => {
    if (!walletService) {
      console.warn('Wallet service not initialized');
      return;
    }

    try {
      setState(prev => ({ ...prev, isLoading: true }));

      console.log('🔄 Fetching all subaccounts from chain...');
      const subaccounts = await walletService.fetchAllSubaccountsFromIndexer();

      setState(prev => ({
        ...prev,
        subaccounts,
        currentSubaccount: subaccounts[0] || prev.currentSubaccount,
        isLoading: false,
      }));

      console.log(`✅ Fetched ${subaccounts.length} subaccounts`);
      return subaccounts;
    } catch (error) {
      console.error('Failed to fetch subaccounts:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: 'Failed to fetch subaccounts',
      }));
    }
  }, [walletService]);

  const createSubaccount = useCallback(
    async (subaccountNumber: number) => {
      if (!walletService) {
        console.warn('Wallet service not initialized');
        return;
      }

      try {
        setState(prev => ({ ...prev, isLoading: true }));

        console.log(`🔄 Creating subaccount #${subaccountNumber}...`);

        const newSubaccount = await walletService.generateSubaccount(subaccountNumber, true);

        setState(prev => ({
          ...prev,
          subaccounts: [...prev.subaccounts, newSubaccount],
          isLoading: false,
        }));

        console.log('✅ Subaccount created:', newSubaccount);
        return newSubaccount;
      } catch (error) {
        console.error('Failed to create subaccount:', error);
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: 'Failed to create subaccount',
        }));
      }
    },
    [walletService]
  );

  const refreshSubaccount = useCallback(
    async (subaccountNumber: number) => {
      if (!walletService) {
        console.warn('Wallet service not initialized');
        return;
      }

      try {
        console.log(`🔄 Refreshing subaccount #${subaccountNumber}...`);

        const updatedSubaccount = await walletService.refreshSubaccount(subaccountNumber);

        setState(prev => ({
          ...prev,
          subaccounts: prev.subaccounts.map(sub =>
            sub.subaccountNumber === subaccountNumber ? updatedSubaccount : sub
          ),
          currentSubaccount:
            prev.currentSubaccount?.subaccountNumber === subaccountNumber
              ? updatedSubaccount
              : prev.currentSubaccount,
        }));

        console.log('✅ Subaccount refreshed:', updatedSubaccount);
        return updatedSubaccount;
      } catch (error) {
        console.error('Failed to refresh subaccount:', error);
      }
    },
    [walletService]
  );

  const switchSubaccount = useCallback(
    async (subaccountNumber: number) => {
      if (!walletService) return;

      const subaccount = walletService.getSubaccount(subaccountNumber);
      if (subaccount) {
        setState(prev => ({ ...prev, currentSubaccount: subaccount }));
        await refreshSubaccount(subaccountNumber);
      }
    },
    [walletService, refreshSubaccount]
  );

  const fetchWalletBalance = useCallback(async () => {
    if (!state.address || !compositeClient) {
      console.warn('Wallet not connected or composite client not initialized');
      return;
    }

    try {
      console.log('🔄 Fetching wallet balance from RPC...');

      const balances = await compositeClient.validatorClient.get.getAccountBalances(state.address);

      if (balances && balances.length > 0) {
        const usdcBalance =
          balances.find(
            b => b.denom.includes('usdc') || b.denom === 'adv4tnt' || b.denom.startsWith('ibc/')
          ) || balances[0];

        setState(prev => ({
          ...prev,
          balance: usdcBalance,
        }));

        console.log('✅ Balance fetched:', usdcBalance);
      } else {
        setState(prev => ({
          ...prev,
          balance: { denom: 'adv4tnt', amount: '0' },
        }));
      }
    } catch (error) {
      console.error('Failed to fetch balance:', error);
    }
  }, [state.address, compositeClient]);

  const fetchSubaccountBalance = useCallback(
    async (subaccountNumber: number = 0) => {
      if (!walletService) {
        console.warn('Wallet service not initialized');
        return;
      }

      try {
        const balanceData = await walletService.fetchSubaccountFromIndexer(subaccountNumber);

        if (balanceData) {
          // Calculate margin usage if not provided
          const marginUsage =
            balanceData.marginUsage ||
            (parseFloat(balanceData.equity || '0') > 0
              ? (
                  ((parseFloat(balanceData.equity || '0') -
                    parseFloat(balanceData.freeCollateral || '0')) /
                    parseFloat(balanceData.equity || '0')) *
                  100
                ).toFixed(2)
              : '0');

          setState(prev => ({
            ...prev,
            subaccountBalance: {
              ...balanceData,
              marginUsage: marginUsage.toString(),
            },
          }));
          console.log('✅ Subaccount balance fetched:', balanceData);
        } else {
          setState(prev => ({
            ...prev,
            subaccountBalance: {
              equity: '0',
              freeCollateral: '0',
              marginUsage: '0',
              openPerpetualPositions: {},
            },
          }));
        }
      } catch (error) {
        console.error('Failed to fetch subaccount balance:', error);
      }
    },
    [walletService]
  );

  const disconnectWallet = useCallback(() => {
    setWalletService(null);
    setCompositeClient(null);
    setState({
      isConnected: false,
      isLoading: false,
      address: null,
      subaccounts: [],
      currentSubaccount: null,
      balance: null,
      subaccountBalance: null,
      error: null,
    });
    console.log('🔌 Wallet disconnected');
  }, []);

  const getWalletSummary = useCallback(() => {
    if (!walletService) return null;
    return walletService.getWalletSummary();
  }, [walletService]);

  const getRealWallet = useCallback((): LocalWallet | null => {
    if (!walletService) return null;
    return walletService.getWallet();
  }, [walletService]);

  const fetchAllData = useCallback(async () => {
    if (!state.isConnected) return;

    console.log('🔄 Refreshing all data...');

    await Promise.all([
      fetchWalletBalance(),
      state.currentSubaccount
        ? fetchSubaccountBalance(state.currentSubaccount.subaccountNumber)
        : Promise.resolve(),
    ]);
  }, [state.isConnected, state.currentSubaccount, fetchWalletBalance, fetchSubaccountBalance]);

  return {
    ...state,
    walletService,
    compositeClient,
    connectWallet,
    disconnectWallet,
    fetchAllSubaccounts,
    createSubaccount,
    switchSubaccount,
    refreshSubaccount,
    fetchWalletBalance,
    fetchSubaccountBalance,
    fetchAllData,
    getWalletSummary,
    getRealWallet,
  };
}
