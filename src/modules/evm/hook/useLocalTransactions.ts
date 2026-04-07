import { useCallback, useEffect, useRef, useState } from 'react';

import { AllbridgeCoreSdk, nodeRpcUrlsDefault } from '@allbridge/bridge-core-sdk';
import { ethers } from 'ethers';

import { WalletType } from '../../walletconnect/constants/Wallet';
import { useWalletConnect } from '../../walletconnect/hooks/useWalletConnect';
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
const STELLAR_CHAIN_ID = 9000000;

const getChainSymbol = (chainId: number): string => {
  switch (chainId) {
    case 1:
      return 'ETH';
    case 56:
      return 'BSC';
    case 137:
      return 'POL';
    case 42161:
      return 'ARB';
    case 10:
      return 'OPT';
    case 43114:
      return 'AVA';
    case 8453:
      return 'BASE';
    default:
      return 'ETH';
  }
};

export const useLocalTransactions = (): UseLocalTransactionsReturn => {
  const { getProvider } = useWalletConnect();
  const [transactions, setTransactions] = useState<LocalTransactionWithStatus[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchTransactionStatus = useCallback(
    async (tx: LocalTransaction): Promise<LocalTransactionWithStatus> => {
      try {
        if (tx.status === 'failed' || tx.hash.startsWith('failed-')) {
          return { ...tx, status: 'failed' };
        }
        if (tx.status === 'success' && tx.type !== 'bridge') {
          return { ...tx, status: 'success' };
        }

        let newStatus: TransactionStatus = 'pending';
        let blockNumber: number | undefined;
        let gasUsed: string | undefined;
        let destinationHash: string | undefined;

        if (tx.type === 'bridge') {
          try {
            const sdk = new AllbridgeCoreSdk(nodeRpcUrlsDefault);
            const chainSymbol = getChainSymbol(tx.chainId);
            const bridgeStatus = (await sdk.getTransferStatus(chainSymbol, tx.hash)) as any;

            console.log('bridgeStatus', bridgeStatus);

            if (bridgeStatus) {
              const isSuccess = bridgeStatus.status === 'SUCCESS' || (bridgeStatus.receive && bridgeStatus.receive.txId);
              const isFailed = bridgeStatus.status === 'FAILED';
              const fromAddress = bridgeStatus.senderAddress || bridgeStatus.send?.sender;
              const toAddress = bridgeStatus.recipientAddress || bridgeStatus.receive?.recipient;

              if (isSuccess) {
                newStatus = 'success';
                destinationHash = bridgeStatus.receive?.txId || bridgeStatus.destinationTxId;
              } else if (isFailed) {
                newStatus = 'failed';
              } else {
                newStatus = 'pending';
              }

              if (newStatus !== tx.status || destinationHash !== tx.destinationHash || fromAddress !== tx.from || toAddress !== tx.to) {
                updateLocalTransactionStatus(tx.hash, newStatus, blockNumber, gasUsed, destinationHash, fromAddress, toAddress);
              }

              return {
                ...tx,
                status: newStatus,
                blockNumber: blockNumber ?? tx.blockNumber,
                gasUsed: gasUsed ?? tx.gasUsed,
                destinationHash: destinationHash ?? tx.destinationHash,
                from: fromAddress ?? tx.from,
                to: toAddress ?? tx.to,
              };
            }
          } catch (e) {
            console.error('Allbridge polling failed:', e);
            newStatus = 'pending';
          }
        }
 else if (tx.chainId === STELLAR_CHAIN_ID) {
          try {
            const isMainnet = localStorage.getItem('network') === 'mainnet';
            const horizonBase = isMainnet
              ? 'https://horizon.stellar.org'
              : 'https://horizon-testnet.stellar.org';
            const res = await fetch(`${horizonBase}/transactions/${tx.hash}`);

            if (res.ok) {
              const data = await res.json();
              if (data.successful) {
                newStatus = 'success';
                blockNumber = data.ledger;
              } else {
                newStatus = 'failed';
              }
            } else if (res.status === 404) {
              newStatus = 'pending';
            }
          } catch (e) {
            console.error('Stellar polling failed:', e);
            newStatus = 'pending';
          }
        } else {
          const provider = getProvider(WalletType.EVM);
          if (!provider) return { ...tx, status: (tx.status as any) || 'pending' };

          const ethersProvider = new ethers.BrowserProvider(provider);
          const receipt = await ethersProvider.getTransactionReceipt(tx.hash);

          if (!receipt) {
            return { ...tx, status: 'pending' };
          }

          newStatus = receipt.status === 1 ? 'success' : 'failed';
          blockNumber = receipt.blockNumber;
          gasUsed = receipt.gasUsed.toString();
        }

        if (newStatus !== tx.status || destinationHash !== tx.destinationHash) {
          updateLocalTransactionStatus(tx.hash, newStatus, blockNumber, gasUsed, destinationHash);
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
    [getProvider]
  );

  const loadTransactions = useCallback(async () => {
    setIsLoading(true);
    try {
      const localTxs = getLocalTransactions();

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
  }, [fetchTransactionStatus]);

  const refreshTransaction = useCallback(async (hash: string) => {
    const localTxs = getLocalTransactions();
    const tx = localTxs.find(t => t.hash.toLowerCase() === hash.toLowerCase());
    if (tx) {
      const updatedTx = await fetchTransactionStatus(tx);
      setTransactions(prev => prev.map(t => t.hash.toLowerCase() === hash.toLowerCase() ? updatedTx : t));
    }
  }, [fetchTransactionStatus]);

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
    const hasPending = transactions.some(tx => 
      tx.status === 'pending' || (tx.type === 'bridge' && tx.status !== 'failed' && !tx.destinationHash)
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
