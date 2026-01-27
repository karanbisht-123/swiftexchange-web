import { useCallback, useEffect, useState } from 'react';

import { TradeTransactionService } from '../service/tradeTransactionService';
import type { UnifiedTransaction } from '../types/allTransaction.types';

import { useWalletStore } from '../../walletconnect/store/walletConnectStore';

interface UseAllTransactionsProps {
    userAddress?: string;
}

export function useAllTransactions({ userAddress }: UseAllTransactionsProps) {
    const currentNetwork = useWalletStore(state => state.network);
    const [service, setService] = useState(() => new TradeTransactionService());

    useEffect(() => {
        setService(new TradeTransactionService());
    }, [currentNetwork]);

    const [transactions, setTransactions] = useState<UnifiedTransaction[]>([]);
    const [pagination, setPagination] = useState<{ hasMore: boolean; cursor?: string }>({
        hasMore: false,
    });
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    const mapOperationToTransaction = useCallback(
        (op: any, accountId: string): UnifiedTransaction | null => {
            const base = {
                id: op.id,
                date: op.created_at,
                isSuccess: op.transaction_successful,
                hash: op.transaction_hash,
            };
            if (op.type === 'payment') {
                const from = op.from || op.source_account;
                const to = op.to || op.into;

                if (from === accountId && to !== accountId) {
                    return {
                        ...base,
                        type: 'SEND',
                        assetCode: op.asset_type === 'native' ? 'XLM' : op.asset_code,
                        amount: op.amount,
                        to: to,
                    };
                } else if (to === accountId) {
                    return {
                        ...base,
                        type: 'RECEIVE',
                        assetCode: op.asset_type === 'native' ? 'XLM' : op.asset_code,
                        amount: op.amount,
                        from: from,
                    };
                }
            }

            if (op.type === 'create_account') {
                if (op.account === accountId) {
                    return {
                        ...base,
                        type: 'RECEIVE',
                        assetCode: 'XLM',
                        amount: op.starting_balance,
                        from: op.source_account,
                    };
                }
            }

            if (op.type === 'path_payment_strict_send' || op.type === 'path_payment_strict_receive') {
                return {
                    ...base,
                    type: 'TRADE',
                    fromAsset: op.source_asset_type === 'native' ? 'XLM' : op.source_asset_code,
                    toAsset: op.asset_type === 'native' ? 'XLM' : op.asset_code,
                    fromAmount: op.source_amount,
                    toAmount: op.amount,
                    path: op.path,
                    details: 'AMM Swap'
                };
            }

            if (op.type === 'invoke_host_function') {
                return {
                    ...base,
                    type: 'BRIDGE',
                    fromAsset: 'Contract',
                    toAsset: 'Interaction',
                    fromAmount: '',
                    toAmount: '',
                    path: [],
                    details: 'Contract Interaction'
                };
            }

            if (
                op.type === 'manage_sell_offer' ||
                op.type === 'manage_buy_offer' ||
                op.type === 'create_passive_sell_offer'
            ) {
                return {
                    ...base,
                    type: 'TRADE',
                    sellAsset: op.selling_asset_type === 'native' ? 'XLM' : op.selling_asset_code || 'XLM', // fallback
                    buyAsset: op.buying_asset_type === 'native' ? 'XLM' : op.buying_asset_code || 'XLM',
                    sellAmount: op.amount || '0',
                    buyAmount: '0',
                    price: op.price,
                    offerId: op.offer_id,
                    details: 'Order Book'
                };
            }

            return {
                ...base,
                type: 'OTHER',
                details: op.type,
            };
        },
        []
    );

    const fetchTransactions = useCallback(
        async (cursor?: string) => {
            if (!userAddress) return;

            setIsLoading(true);
            setError(null);

            try {
                const { operations, nextCursor, hasMore } = await service.getAllOperations(
                    userAddress,
                    20,
                    cursor
                );

                const mapped = operations
                    .map(op => mapOperationToTransaction(op, userAddress))
                    .filter((tx): tx is UnifiedTransaction => tx !== null);

                setTransactions(prev => (cursor ? [...prev, ...mapped] : mapped));
                setPagination({ cursor: nextCursor, hasMore });
            } catch (err) {
                console.error('Failed to fetch transactions', err);
                setError('Failed to load transaction history');
            } finally {
                setIsLoading(false);
            }
        },
        [userAddress, service, mapOperationToTransaction]
    );

    useEffect(() => {
        if (userAddress) {
            fetchTransactions();
        }
    }, [userAddress, fetchTransactions]);

    const loadMore = () => {
        if (pagination.hasMore && pagination.cursor) {
            fetchTransactions(pagination.cursor);
        }
    };

    return {
        transactions,
        isLoading,
        error,
        hasMore: pagination.hasMore,
        loadMore,
        refresh: () => fetchTransactions(),
    };
}
