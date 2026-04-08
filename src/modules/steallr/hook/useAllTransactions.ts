import { useCallback, useEffect, useState } from 'react';

import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import { TradeTransactionService } from '../service/tradeTransactionService';
import type { UnifiedTransaction } from '../types/allTransaction.types';

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
  const [isLoading, setIsLoading] = useState<boolean>(true);
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
            details: 'Account Created',
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
          details: 'AMM Swap',
        };
      }

      if (op.type === 'invoke_host_function') {
        let details = 'Contract Interaction';
        let fromAsset = 'Contract';
        let toAsset = 'Interaction';
        let amount = 'N/A';
        let assetCode = 'N/A';

        if (op.asset_balance_changes && op.asset_balance_changes.length > 0) {
          const relevantChange =
            op.asset_balance_changes.find(
              (c: any) => c.to === accountId || c.from === accountId
            ) ?? op.asset_balance_changes[0];

          amount = relevantChange.amount ?? 'N/A';
          assetCode =
            relevantChange.asset_type === 'native'
              ? 'XLM'
              : relevantChange.asset_code ?? 'N/A';
        }

        if (op.function === 'HostFunctionTypeHostFunctionTypeInvokeContract') {
          details = 'Smart Contract Call';
          const contractId =
            (op as any).contract_id ?? (op as any).contract ?? 'Unknown Contract';
          if (contractId !== 'Unknown Contract') {
            toAsset = contractId.length > 12 ? `${contractId.slice(0, 12)}...` : contractId;
          }
        }

        return {
          ...base,
          type: 'BRIDGE',
          fromAsset,
          toAsset,
          amount,
          assetCode,
          details,
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
          sellAsset: op.selling_asset_type === 'native' ? 'XLM' : op.selling_asset_code || 'XLM',
          buyAsset: op.buying_asset_type === 'native' ? 'XLM' : op.buying_asset_code || 'XLM',
          sellAmount: op.amount || '0',
          buyAmount: '0',
          price: op.price,
          offerId: op.offer_id,
          details: 'Order Book',
        };
      }

      if (op.type === 'change_trust') {
        return {
          ...base,
          type: 'TRUST',
          assetCode: op.asset_type === 'native' ? 'XLM' : op.asset_code,
          limit: op.limit,
          trustee: op.trustee,
          trustor: op.trustor,
          details: `Trustline ${parseFloat(op.limit) > 0 ? 'Set' : 'Removed'}`,
        };
      }

      if (op.type === 'create_claimable_balance') {
        const assetParts = op.asset.split(':');
        const assetCode = assetParts.length > 1 ? assetParts[0] : 'Unknown';

        return {
          ...base,
          type: 'CLAIMABLE',
          assetCode: assetCode,
          amount: op.amount,
          sponsor: op.sponsor,
          claimants: op.claimants,
          details: 'Claimable Balance Created',
        };
      }

      if (op.type === 'claim_claimable_balance') {
        return {
          ...base,
          type: 'CLAIMABLE',
          details: 'Claimable Balance Claimed',
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
      if (!userAddress) {
        setIsLoading(false);
        return;
      }

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
      setIsLoading(true);
      fetchTransactions();
    } else {
      setIsLoading(false);
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