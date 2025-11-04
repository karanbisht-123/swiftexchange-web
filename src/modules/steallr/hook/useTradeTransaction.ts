import { useCallback, useEffect, useState } from 'react';

import { ERROR_MESSAGES } from '../constants/tradeTransactionConstants';
import { TradeTransactionService } from '../service/tradeTransactionService';
import type { ActiveOffer, CompletedTrade, Pagination } from '../types/tradeTransaction.types';

interface UseTradeTransactionProps {
  networkKey: string;
  userAddress?: string;
}

export function useTradeTransaction({ networkKey, userAddress }: UseTradeTransactionProps) {
  console.log(networkKey, 'jhsdfkjsdhfkjdhfjkdfjkdfhdjskh');
  const [service] = useState(() => new TradeTransactionService(networkKey));

  const [activeOffers, setActiveOffers] = useState<ActiveOffer[]>([]);
  const [completedTrades, setCompletedTrades] = useState<CompletedTrade[]>([]);
  const [activePagination, setActivePagination] = useState<Pagination>({
    hasMore: false,
  });
  const [completedPagination, setCompletedPagination] = useState<Pagination>({
    hasMore: false,
  });
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchActiveOffers = useCallback(
    async (cursor?: string) => {
      if (!userAddress) {
        setError(ERROR_MESSAGES.NO_WALLET_CONNECTED);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const { offers, nextCursor, hasMore } = await service.getActiveOffers(
          userAddress,
          10,
          cursor
        );
        setActiveOffers(prev => (cursor ? [...prev, ...offers] : offers));
        setActivePagination({ cursor: nextCursor, hasMore });
      } catch (err) {
        setError(ERROR_MESSAGES.LOAD_ACTIVE_OFFERS_FAILED);
        console.error('Failed to fetch active offers:', err);
      } finally {
        setIsLoading(false);
      }
    },
    [userAddress, service]
  );

  const fetchCompletedTrades = useCallback(
    async (cursor?: string) => {
      if (!userAddress) {
        setError(ERROR_MESSAGES.NO_WALLET_CONNECTED);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const { trades, nextCursor, hasMore } = await service.getCompletedTrades(
          userAddress,
          10,
          cursor
        );
        setCompletedTrades(prev => (cursor ? [...prev, ...trades] : trades));
        setCompletedPagination({ cursor: nextCursor, hasMore });
      } catch (err) {
        setError(ERROR_MESSAGES.LOAD_COMPLETED_TRADES_FAILED);
        console.error('Failed to fetch completed trades:', err);
      } finally {
        setIsLoading(false);
      }
    },
    [userAddress, service]
  );

  const cancelOffer = useCallback(
    async (offer: ActiveOffer, walletProvider: any) => {
      if (!userAddress) {
        throw new Error(ERROR_MESSAGES.NO_WALLET_CONNECTED);
      }

      if (!walletProvider) {
        throw new Error('Wallet provider not available');
      }

      setIsLoading(true);
      setError(null);

      try {
        const tx = await service.buildCancelOfferTransaction(userAddress, offer);
        const txHash = await service.executeCancelOfferWithWalletConnect(tx, walletProvider);
        // Refresh active offers after cancel
        await fetchActiveOffers();
        return txHash;
      } catch (err) {
        setError(ERROR_MESSAGES.CANCEL_OFFER_FAILED);
        console.error('Failed to cancel offer:', err);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [userAddress, service, fetchActiveOffers]
  );

  const editOffer = useCallback(
    async (offer: ActiveOffer, walletProvider: any, newAmount: string, newPrice: string) => {
      if (!userAddress) {
        throw new Error(ERROR_MESSAGES.NO_WALLET_CONNECTED);
      }

      if (!walletProvider) {
        throw new Error('Wallet provider not available');
      }

      if (parseFloat(newAmount) <= 0 || parseFloat(newPrice) <= 0) {
        throw new Error('Amount and price must be positive');
      }

      setIsLoading(true);
      setError(null);

      try {
        const tx = await service.buildEditOfferTransaction(userAddress, offer, newAmount, newPrice);
        const txHash = await service.executeEditOfferWithWalletConnect(tx, walletProvider);
        // Refresh active offers after edit
        await fetchActiveOffers();
        return txHash;
      } catch (err) {
        setError('Failed to edit offer');
        console.error('Failed to edit offer:', err);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [userAddress, service, fetchActiveOffers]
  );

  // Initial fetch
  useEffect(() => {
    if (userAddress) {
      fetchActiveOffers();
      fetchCompletedTrades();
    }
  }, [userAddress, fetchActiveOffers, fetchCompletedTrades]);

  const reset = useCallback(() => {
    setActiveOffers([]);
    setCompletedTrades([]);
    setActivePagination({ hasMore: false });
    setCompletedPagination({ hasMore: false });
    setError(null);
  }, []);

  return {
    activeOffers,
    completedTrades,
    activePagination,
    completedPagination,
    isLoading,
    error,
    fetchActiveOffers,
    fetchCompletedTrades,
    cancelOffer,
    editOffer,
    reset,
  };
}
