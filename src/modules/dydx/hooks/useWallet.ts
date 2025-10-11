// import { useCallback, useEffect } from 'react';

// // import { useWalletConnectStore } from '../../walletconnect/store/walletConnectStore';
// import { walletService } from '../service/walletService';
// import { useDydxStore } from '../store/dydxStore';
// import { type DydxNetwork } from '../types/wallet.types';

// export interface UseDydxReturn {
//   // State
//   isConnected: boolean;
//   address: string | null;
//   publicKey: string | null;
//   network: DydxNetwork;
//   positions: any[];
//   balances: any[];
//   markets: any[];
//   isLoading: boolean;
//   error: string | null;
//   connectionStep: 'idle' | 'signing' | 'deriving' | 'initializing' | 'fetching' | 'connected';

//   // Actions
//   connectDydx: () => Promise<void>;
//   disconnectDydx: () => Promise<void>;
//   switchNetwork: (network: DydxNetwork) => Promise<void>;
//   refreshBalances: () => Promise<void>;
//   refreshPositions: () => Promise<void>;
//   refreshMarkets: () => Promise<void>;
//   refreshAll: () => Promise<void>;
// }

// export const useDydx = (): UseDydxReturn => {
//   const {
//     isConnected,
//     address,
//     publicKey,
//     network,
//     positions,
//     balances,
//     markets,
//     isLoading,
//     error,
//     connectionStep,
//     setAddress,
//     setMnemonic,
//     setConnected,
//     setNetwork,
//     setPositions,
//     setBalances,
//     setMarkets,
//     setLoading,
//     setError,
//     setConnectionStep,
//     reset,
//   } = useDydxStore();

//   // Get wallet data from WalletConnect store
//   const walletStore = useWalletConnectStore();
//   const walletConnected = walletStore.isConnected;
//   const evmAddress = walletStore.addresses.evm;
//   const provider = walletStore.provider;
//   const chainId = walletStore.chainId;

//   /**
//    * Sign message using WalletConnect provider with explicit EVM chain
//    * This prevents the cosmos chainId error
//    */
//   const signMessage = useCallback(
//     async (message: string): Promise<string> => {
//       if (!provider || !evmAddress) {
//         throw new Error('Wallet not connected');
//       }

//       try {
//         console.log('🔐 Requesting signature for message...');

//         // Get the current EVM chain ID or default to Ethereum mainnet
//         const evmChainId = chainId?.startsWith('eip155:') ? chainId : 'eip155:1'; // Default to Ethereum mainnet

//         console.log('📡 Using chain ID:', evmChainId);

//         // Request signature with explicit chain context
//         const signature = await provider.request(
//           {
//             method: 'personal_sign',
//             params: [message, evmAddress],
//           },
//           evmChainId // Pass the EVM chain ID explicitly
//         );

//         return signature;
//       } catch (error: any) {
//         console.error('❌ Failed to sign message:', error);

//         // Better error messages
//         if (error?.message?.includes('chainId')) {
//           throw new Error('Chain not supported. Please connect with an EVM wallet only.');
//         }
//         if (error?.message?.includes('rejected') || error?.message?.includes('denied')) {
//           throw new Error('Signature request rejected by user');
//         }

//         throw new Error(error?.message || 'Failed to sign message');
//       }
//     },
//     [provider, evmAddress, chainId]
//   );

//   /**
//    * Connect to dYdX by deriving address from EVM wallet
//    */
//   const connectDydx = useCallback(async () => {
//     if (!walletConnected || !evmAddress) {
//       throw new Error('Please connect your wallet first');
//     }

//     // Check if EVM address exists
//     if (!evmAddress) {
//       throw new Error('No EVM address found. Please connect with an EVM wallet.');
//     }

//     setLoading(true);
//     setError(null);
//     setConnectionStep('signing');

//     try {
//       console.log('🚀 Starting dYdX connection...');
//       console.log('📍 EVM Address:', evmAddress);

//       // Step 1: Request signature and derive address
//       setConnectionStep('signing');
//       console.log('📝 Requesting wallet signature...');

//       const result = await walletService.deriveDydxAddress(evmAddress, signMessage);

//       console.log('✅ dYdX address derived:', result.address);

//       // Step 2: Initialize wallet
//       setConnectionStep('initializing');
//       console.log('⚙️ Initializing dYdX wallet...');

//       // Store address, public key, and mnemonic
//       setAddress(result.address, result.publicKey);
//       setMnemonic(result.mnemonic);

//       // Initialize dYdX service with current network
//       await walletService.initialize(network, result.mnemonic);

//       setConnected(true);

//       // Step 3: Fetch account data
//       setConnectionStep('fetching');
//       console.log('📊 Fetching account data...');
//       await refreshAll();

//       setConnectionStep('connected');
//       console.log('✅ Successfully connected to dYdX');
//     } catch (error: any) {
//       const message = error?.message || 'Failed to connect to dYdX';
//       console.error('❌ Connection error:', message);
//       setError(message);
//       setConnectionStep('idle');
//       throw error;
//     } finally {
//       setLoading(false);
//     }
//   }, [
//     walletConnected,
//     evmAddress,
//     signMessage,
//     network,
//     setAddress,
//     setMnemonic,
//     setConnected,
//     setLoading,
//     setError,
//     setConnectionStep,
//   ]);

//   /**
//    * Disconnect from dYdX
//    */
//   const disconnectDydx = useCallback(async () => {
//     try {
//       walletService.disconnect();
//       reset();
//       console.log('🔌 Disconnected from dYdX');
//     } catch (error) {
//       console.error('❌ Error disconnecting:', error);
//     }
//   }, [reset]);

//   /**
//    * Switch between mainnet and testnet
//    */
//   const switchNetwork = useCallback(
//     async (newNetwork: DydxNetwork) => {
//       if (!isConnected) {
//         throw new Error('Not connected to dYdX');
//       }

//       setLoading(true);
//       setError(null);

//       try {
//         console.log(`🔄 Switching to ${newNetwork}...`);

//         await walletService.switchNetwork(newNetwork);
//         setNetwork(newNetwork);

//         // Refresh data for new network
//         await refreshAll();

//         console.log(`✅ Switched to ${newNetwork}`);
//       } catch (error: any) {
//         const message = error?.message || 'Failed to switch network';
//         console.error('❌ Network switch error:', message);
//         setError(message);
//         throw error;
//       } finally {
//         setLoading(false);
//       }
//     },
//     [isConnected, setLoading, setError, setNetwork]
//   );

//   /**
//    * Refresh account balances
//    */
//   const refreshBalances = useCallback(async () => {
//     if (!address) return;

//     try {
//       const balanceData = await walletService.getBalances(address);
//       setBalances([
//         { denom: 'USDC', amount: balanceData.equity },
//         { denom: 'Free Collateral', amount: balanceData.freeCollateral },
//       ]);
//       console.log('💰 Balances refreshed');
//     } catch (error) {
//       console.error('❌ Failed to refresh balances:', error);
//     }
//   }, [address, setBalances]);

//   /**
//    * Refresh open positions
//    */
//   const refreshPositions = useCallback(async () => {
//     if (!address) return;

//     try {
//       const pos = await walletService.getPositions(address);
//       setPositions(pos);
//       console.log('📊 Positions refreshed:', pos.length);
//     } catch (error) {
//       console.error('❌ Failed to refresh positions:', error);
//     }
//   }, [address, setPositions]);

//   /**
//    * Refresh market data
//    */
//   const refreshMarkets = useCallback(async () => {
//     try {
//       const mkts = await walletService.getMarkets();
//       setMarkets(Object.values(mkts));
//       console.log('📈 Markets refreshed');
//     } catch (error) {
//       console.error('❌ Failed to refresh markets:', error);
//     }
//   }, [setMarkets]);

//   /**
//    * Refresh all data
//    */
//   const refreshAll = useCallback(async () => {
//     await Promise.allSettled([refreshBalances(), refreshPositions(), refreshMarkets()]);
//   }, [refreshBalances, refreshPositions, refreshMarkets]);

//   // Auto-connect to dYdX when wallet connects
//   useEffect(() => {
//     const autoConnect = async () => {
//       // Only auto-connect if:
//       // 1. Wallet is connected
//       // 2. dYdX is not connected
//       // 3. Not currently loading
//       // 4. Has EVM address
//       if (walletConnected && !isConnected && !isLoading && evmAddress) {
//         try {
//           console.log('🔄 Auto-connecting to dYdX...');
//           await connectDydx();
//         } catch (error: any) {
//           console.error('❌ Auto-connect failed:', error);
//           // Don't throw - let user retry manually if needed
//         }
//       }
//     };

//     autoConnect();
//   }, [walletConnected, evmAddress]); // Only depend on wallet connection state

//   // Auto-disconnect when wallet disconnects
//   useEffect(() => {
//     if (!walletConnected && isConnected) {
//       console.log('🔌 Wallet disconnected, cleaning up dYdX connection...');
//       disconnectDydx();
//     }
//   }, [walletConnected, isConnected, disconnectDydx]);

//   return {
//     // State
//     isConnected,
//     address,
//     publicKey,
//     network,
//     positions,
//     balances,
//     markets,
//     isLoading,
//     error,
//     connectionStep,

//     // Actions
//     connectDydx,
//     disconnectDydx,
//     switchNetwork,
//     refreshBalances,
//     refreshPositions,
//     refreshMarkets,
//     refreshAll,
//   };
// };

// // Convenience hooks
// export const useDydxAddress = (): string | null => {
//   return useDydxStore(state => state.address);
// };

// export const useDydxNetwork = (): DydxNetwork => {
//   return useDydxStore(state => state.network);
// };

// export const useDydxBalances = () => {
//   return useDydxStore(state => state.balances);
// };

// export const useDydxPositions = () => {
//   return useDydxStore(state => state.positions);
// };

// export const useDydxIsConnected = (): boolean => {
//   return useDydxStore(state => state.isConnected);
// };

// export const useDydxConnectionStep = () => {
//   return useDydxStore(state => state.connectionStep);
// };
