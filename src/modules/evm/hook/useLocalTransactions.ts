import { useCallback, useEffect, useRef, useState } from 'react';

import { ethers } from 'ethers';

import { WalletType } from '../../walletconnect/constants/Wallet';
import { useWalletConnect } from '../../walletconnect/hooks/useWalletConnect';
import {
    type LocalTransaction,
    getLocalTransactions,
    removeLocalTransaction,
} from '../service/localTransactionService';

export type TransactionStatus = 'pending' | 'confirmed' | 'failed';

export interface LocalTransactionWithStatus extends LocalTransaction {
    status: TransactionStatus;
    blockNumber?: number;
    gasUsed?: string;
}

interface UseLocalTransactionsReturn {
    transactions: LocalTransactionWithStatus[];
    isLoading: boolean;
    refresh: () => void;
    removeTransaction: (hash: string) => void;
    hasPendingTransactions: boolean;
}

const REFRESH_INTERVAL = 20000;

export const useLocalTransactions = (): UseLocalTransactionsReturn => {
    const { getProvider } = useWalletConnect();
    const [transactions, setTransactions] = useState<LocalTransactionWithStatus[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const fetchTransactionStatus = useCallback(
        async (tx: LocalTransaction): Promise<LocalTransactionWithStatus> => {
            try {
                const provider = getProvider(WalletType.EVM);
                if (!provider) {
                    return { ...tx, status: 'pending' };
                }

                const ethersProvider = new ethers.BrowserProvider(provider);
                const receipt = await ethersProvider.getTransactionReceipt(tx.hash);

                if (!receipt) {
                    return { ...tx, status: 'pending' };
                }

                const status: TransactionStatus = receipt.status === 1 ? 'confirmed' : 'failed';

                return {
                    ...tx,
                    status,
                    blockNumber: receipt.blockNumber,
                    gasUsed: receipt.gasUsed.toString(),
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

            const txsWithStatus = await Promise.all(
                localTxs.map(tx => fetchTransactionStatus(tx))
            );

            setTransactions(txsWithStatus);
        } catch (error) {
            console.error('Failed to load local transactions:', error);
        } finally {
            setIsLoading(false);
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
        const hasPending = transactions.some(tx => tx.status === 'pending');

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
        removeTransaction: handleRemoveTransaction,
        hasPendingTransactions,
    };
};
