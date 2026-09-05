import { useCallback, useEffect, useRef, useState } from 'react';

import { ethers } from 'ethers';

import { WalletType } from '../../walletconnect/constants/Wallet';
import { useWalletConnect } from '../../walletconnect/hooks/useWalletConnect';
import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import {
  type LocalTransaction,
  getLocalTransactions,
  removeLocalTransaction,
  updateLocalTransactionStatus,
} from '../service/localTransactionService';

export type TransactionStatus = 'pending' | 'success' | 'failed';

export interface LocalTransactionWithStatus extends LocalTransaction {
  status: TransactionStatus;
  blockNumber?: number;
  gasUsed?: string;
  destinationHash?: string;
}

interface UseLocalTransactionsReturn {
  transactions: LocalTransactionWithStatus[];
  isLoading: boolean;
  refresh: () => void;
  refreshTransaction: (hash: string) => Promise<void>;
  removeTransaction: (hash: string) => void;
  hasPendingTransactions: boolean;
}

const REFRESH_INTERVAL = 30000;

export const useLocalTransactions = (): UseLocalTransactionsReturn => {
  const { getProvider } = useWalletConnect();
  const connectedWallets = useWalletStore(state => state.connectedWallets);
  const currentNetwork = useWalletStore(state => state.network);

  const evmWallet = connectedWallets[WalletType.EVM];
  const stellarWallet = connectedWallets[WalletType.STELLAR];

  const currentAddresses = [evmWallet?.address, stellarWallet?.address].filter(Boolean) as string[];

  const currentAddress = currentAddresses[0];

  const [transactions, setTransactions] = useState<LocalTransactionWithStatus[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    // Read-time filtering in getLocalTransactions is sufficient to hide other wallets' txs.
    // Destructive cleanup causes race conditions when wallets load asynchronously.
  }, [JSON.stringify(currentAddresses), currentNetwork]);

  const fetchTransactionStatus = useCallback(
    async (tx: LocalTransaction): Promise<LocalTransactionWithStatus> => {
      try {
        if (tx.status === 'failed' || tx.hash.startsWith('failed-')) {
          return { ...tx, status: 'failed' };
        }
        if (tx.status === 'success' && (tx.type !== 'bridge' || tx.destinationHash)) {
          return { ...tx, status: 'success' };
        }

        let newStatus: TransactionStatus = 'pending';
        let blockNumber: number | undefined;
        let gasUsed: string | undefined;
        let destinationHash: string | undefined;
        const fromAddress: string | undefined = tx.from;
        const toAddress: string | undefined = tx.to;

        const providerUpper = tx.provider?.toUpperCase();
        const isBypassed =
          !tx.provider ||
          providerUpper === 'UNISWAP' ||
          providerUpper === 'EVMTX' ||
          providerUpper === 'ONEINCH' ||
          providerUpper === 'ONEINCH_FUSION' ||
          providerUpper === 'ONEINCH_FUSION_PLUS' ||
          providerUpper === 'RANGO';
        if (tx.chainId === 'pubnet' || tx.chainId === 'testnet' || tx.chainId === 'stellar') {
          /* Commented out for now to avoid polling Horizon for Stellar transactions
          try {
            const horizonBase = currentNetwork === 'mainnet'
              ? 'https://horizon.stellar.org'
              : 'https://horizon-testnet.stellar.org';
            const res = await fetch(`${horizonBase}/transactions/${tx.hash}`);

            if (res.ok) {
              const data = await res.json();
              newStatus = data.successful ? 'success' : 'failed';
              blockNumber = data.ledger;
            } else if (res.status === 404) {
              newStatus = 'pending';
            }
          } catch (e) {
            console.error('Stellar polling failed:', e);
            newStatus = 'pending';
          }
          */
          return { ...tx, status: tx.status || 'success' };
        } else if (isBypassed) {
          // Skip polling on-chain for UNISWAP/EVMTX/ONEINCH/RANGO; status updates come from the backend.
          // Keeping code for future use.
          return { ...tx, status: tx.status || 'pending' };
        } else {
          const provider = getProvider(WalletType.EVM);
          if (provider) {
            try {
              const ethersProvider = new ethers.BrowserProvider(provider);
              const receipt = await ethersProvider.getTransactionReceipt(tx.hash);

              if (receipt) {
                newStatus = receipt.status === 1 ? 'success' : 'failed';
                blockNumber = receipt.blockNumber;
                gasUsed = receipt.gasUsed.toString();
                if (newStatus === 'success' && tx.type === 'bridge') {
                  if (tx.provider?.toUpperCase() === 'SKIP' || tx.to === 'dydx') {
                    try {
                      const url = `https://api.skip.build/v2/tx/status?chain_id=${tx.chainId}&tx_hash=${tx.hash}`;
                      const skipRes = await fetch(url);
                      if (skipRes.ok) {
                        const skipData = await skipRes.json();
                        if (skipData.state === 'STATE_COMPLETED_SUCCESS') {
                          newStatus = 'success';
                          const steps = skipData.transfer_sequence || [];
                          const lastStep = steps[steps.length - 1];
                          const lastStepDetails = lastStep
                            ? (lastStep[
                                Object.keys(lastStep).find(k => k.endsWith('_transfer')) ?? ''
                              ] ?? lastStep)
                            : null;
                          const pkt = lastStepDetails?.packet_txs ?? lastStepDetails?.txs;
                          destinationHash =
                            pkt?.receive_tx?.tx_hash ||
                            pkt?.acknowledge_tx?.tx_hash ||
                            pkt?.receive_tx?.txHash ||
                            pkt?.acknowledge_tx?.txHash;
                        } else if (
                          skipData.state === 'STATE_COMPLETED_ERROR' ||
                          skipData.state === 'STATE_ABANDONED'
                        ) {
                          newStatus = 'failed';
                        } else {
                          newStatus = 'pending';
                        }
                      } else {
                        newStatus = 'pending';
                      }
                    } catch (skipErr) {
                      console.warn('Skip-specific detail fetch failed:', skipErr);
                      newStatus = 'pending';
                    }
                  }
                }
              } else {
                newStatus = 'pending';
              }
            } catch (evmErr) {
              console.error('EVM polling failed:', evmErr);
              newStatus = 'pending';
            }
          }
        }

        if (
          newStatus !== tx.status ||
          destinationHash !== tx.destinationHash ||
          fromAddress !== tx.from ||
          toAddress !== tx.to
        ) {
          updateLocalTransactionStatus(
            tx.hash,
            newStatus,
            blockNumber,
            gasUsed,
            destinationHash,
            fromAddress,
            toAddress
          );
        }

        return {
          ...tx,
          status: newStatus,
          blockNumber: blockNumber ?? tx.blockNumber,
          gasUsed: gasUsed ?? tx.gasUsed,
          destinationHash: destinationHash ?? tx.destinationHash,
        };
      } catch (error) {
        console.error(`Failed to fetch status for tx ${tx.hash}:`, error);
        return { ...tx, status: 'pending' };
      }
    },
    [getProvider, currentNetwork]
  );

  const loadTransactions = useCallback(async () => {
    if (!currentAddress) {
      setTransactions([]);
      return;
    }

    setIsLoading(true);
    try {
      const localTxs = getLocalTransactions(currentAddresses, currentNetwork);

      if (localTxs.length === 0) {
        setTransactions([]);
        return;
      }

      const txsWithStatus = await Promise.all(localTxs.map(tx => fetchTransactionStatus(tx)));
      setTransactions(txsWithStatus);
    } catch (error) {
      console.error('Failed to load local transactions:', error);
    } finally {
      setIsLoading(false);
    }
  }, [fetchTransactionStatus, currentAddress, currentNetwork]);

  const refreshTransaction = useCallback(
    async (hash: string) => {
      const localTxs = getLocalTransactions(currentAddresses, currentNetwork);
      const tx = localTxs.find(t => t.hash.toLowerCase() === hash.toLowerCase());
      if (tx) {
        const updatedTx = await fetchTransactionStatus(tx);
        setTransactions(prev =>
          prev.map(t => (t.hash.toLowerCase() === hash.toLowerCase() ? updatedTx : t))
        );
      }
    },
    [fetchTransactionStatus, currentAddress, currentNetwork]
  );

  const refresh = useCallback(() => {
    loadTransactions();
  }, [loadTransactions]);

  const handleRemoveTransaction = useCallback((hash: string) => {
    removeLocalTransaction(hash);
    setTransactions(prev => prev.filter(tx => tx.hash.toLowerCase() !== hash.toLowerCase()));
  }, []);

  useEffect(() => {
    loadTransactions();
  }, [loadTransactions]);

  useEffect(() => {
    const hasPending = transactions.some(
      tx =>
        tx.status === 'pending' ||
        (tx.type === 'bridge' && tx.status !== 'failed' && !tx.destinationHash)
    );

    if (hasPending && !intervalRef.current) {
      intervalRef.current = setInterval(() => {
        loadTransactions();
      }, REFRESH_INTERVAL);
    } else if (!hasPending && intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [transactions, loadTransactions]);

  const hasPendingTransactions = transactions.some(tx => tx.status === 'pending');

  return {
    transactions,
    isLoading,
    refresh,
    refreshTransaction,
    removeTransaction: handleRemoveTransaction,
    hasPendingTransactions,
  };
};
