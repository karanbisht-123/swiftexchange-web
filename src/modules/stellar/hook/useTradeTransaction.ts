import { useCallback, useEffect, useRef, useState } from 'react';

import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import { ERROR_MESSAGES } from '../constants/tradeTransactionConstants';
import { TradeTransactionService } from '../service/tradeTransactionService';
import type { ActiveOffer, CompletedTrade, Pagination } from '../types/tradeTransaction.types';

interface UseTradeTransactionProps {
  userAddress?: string;
}

export function dispatchStellarOrderPlaced() {
  window.dispatchEvent(new CustomEvent('stellar:order-placed'));
}

export function useTradeTransaction({ userAddress }: UseTradeTransactionProps) {
  const currentNetwork = useWalletStore(state => state.network);
  const serviceRef = useRef<TradeTransactionService>(null as any);

  if (!serviceRef.current) {
    serviceRef.current = new TradeTransactionService();
  }

  const hasLoadedActiveRef = useRef(false);
  const hasLoadedCompletedRef = useRef(false);

  useEffect(() => {
    serviceRef.current = new TradeTransactionService();
    hasLoadedActiveRef.current = false;
    hasLoadedCompletedRef.current = false;
  }, [currentNetwork]);

  const [activeOffers, setActiveOffers] = useState<ActiveOffer[]>([]);
  const [completedTrades, setCompletedTrades] = useState<CompletedTrade[]>([]);
  const [activePagination, setActivePagination] = useState<Pagination>({
    hasMore: false,
  });
  const [completedPagination, setCompletedPagination] = useState<Pagination>({
    hasMore: false,
  });
  const [isLoadingActive, setIsLoadingActive] = useState<boolean>(false);
  const [isLoadingCompleted, setIsLoadingCompleted] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [newOfferIds, setNewOfferIds] = useState<Set<string>>(new Set());
  const [removingOfferIds, setRemovingOfferIds] = useState<Set<string>>(new Set());

  const mountedRef = useRef(true);
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const fetchActiveOffers = useCallback(
    async (cursor?: string, isBackgroundRefresh = false) => {
      if (!userAddress) {
        setError(ERROR_MESSAGES.NO_WALLET_CONNECTED);
        return;
      }

      if (!isBackgroundRefresh && !hasLoadedActiveRef.current) {
        setIsLoadingActive(true);
      }
      setError(null);

      try {
        const { offers, nextCursor, hasMore } = await serviceRef.current.getActiveOffers(
          userAddress,
          10,
          cursor
        );
        if (!mountedRef.current) return;
        hasLoadedActiveRef.current = true;
        setActiveOffers(prev => {
          const list = cursor ? [...prev, ...offers] : offers;
          const seen = new Set<string>();
          const deduped = list.filter(o => {
            if (seen.has(o.id)) return false;
            seen.add(o.id);
            return true;
          });
          const existingIds = new Set(prev.map(o => o.id));
          const freshIds = offers.filter(o => !existingIds.has(o.id)).map(o => o.id);
          if (freshIds.length > 0) {
            setNewOfferIds(s => new Set([...s, ...freshIds]));
            setTimeout(() => {
              if (mountedRef.current) {
                setNewOfferIds(s => {
                  const next = new Set(s);
                  freshIds.forEach(id => next.delete(id));
                  return next;
                });
              }
            }, 2000);
          }
          return deduped;
        });
        setActivePagination({ cursor: nextCursor, hasMore });
      } catch (err) {
        if (mountedRef.current) {
          setError(ERROR_MESSAGES.LOAD_ACTIVE_OFFERS_FAILED);
          console.error('Failed to fetch active offers:', err);
        }
      } finally {
        if (mountedRef.current && !isBackgroundRefresh) {
          setIsLoadingActive(false);
        }
      }
    },
    [userAddress]
  );

  const fetchCompletedTrades = useCallback(
    async (cursor?: string, isBackgroundRefresh = false) => {
      if (!userAddress) {
        setError(ERROR_MESSAGES.NO_WALLET_CONNECTED);
        return;
      }

      if (!isBackgroundRefresh && !hasLoadedCompletedRef.current) {
        setIsLoadingCompleted(true);
      }
      setError(null);

      try {
        const { trades, nextCursor, hasMore } = await serviceRef.current.getCompletedTrades(
          userAddress,
          10,
          cursor
        );
        if (!mountedRef.current) return;
        hasLoadedCompletedRef.current = true;
        setCompletedTrades(prev => {
          const list = cursor ? [...prev, ...trades] : trades;
          const seen = new Set<string>();
          return list.filter(t => {
            if (seen.has(t.id)) return false;
            seen.add(t.id);
            return true;
          });
        });
        setCompletedPagination({ cursor: nextCursor, hasMore });
      } catch (err) {
        if (mountedRef.current) {
          setError(ERROR_MESSAGES.LOAD_COMPLETED_TRADES_FAILED);
          console.error('Failed to fetch completed trades:', err);
        }
      } finally {
        if (mountedRef.current && !isBackgroundRefresh) {
          setIsLoadingCompleted(false);
        }
      }
    },
    [userAddress]
  );

  useEffect(() => {
    const handler = () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
      refreshTimeoutRef.current = setTimeout(() => {
        fetchActiveOffers();
        fetchCompletedTrades();
      }, 2000);
    };
    window.addEventListener('stellar:order-placed', handler);
    return () => {
      window.removeEventListener('stellar:order-placed', handler);
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
    };
  }, [fetchActiveOffers, fetchCompletedTrades]);

  useEffect(() => {
    mountedRef.current = true;
    if (userAddress) {
      fetchActiveOffers();
      fetchCompletedTrades();
    }
    return () => {
      mountedRef.current = false;
    };
  }, [userAddress, fetchActiveOffers, fetchCompletedTrades]);

  useEffect(() => {
    if (!userAddress) return;
    const activeInterval = setInterval(() => {
      fetchActiveOffers(undefined, true);
    }, 15000);

    const completedInterval = setInterval(() => {
      fetchCompletedTrades(undefined, true);
    }, 30000);

    return () => {
      clearInterval(activeInterval);
      clearInterval(completedInterval);
    };
  }, [userAddress, fetchActiveOffers, fetchCompletedTrades]);

  const cancelOffer = useCallback(
    async (offer: ActiveOffer, walletProvider: any) => {
      if (!userAddress) throw new Error(ERROR_MESSAGES.NO_WALLET_CONNECTED);
      if (!walletProvider) throw new Error('Wallet provider not available');

      setRemovingOfferIds(prev => new Set([...prev, offer.id]));
      setError(null);

      try {
        const tx = await serviceRef.current.buildCancelOfferTransaction(userAddress, offer);
        const txHash = await serviceRef.current.executeCancelOfferWithWalletConnect(
          tx,
          walletProvider
        );

        if (mountedRef.current) {
          setActiveOffers(prev => prev.filter(o => o.id !== offer.id));
          setRemovingOfferIds(prev => {
            const next = new Set(prev);
            next.delete(offer.id);
            return next;
          });
        }

        setTimeout(() => fetchActiveOffers(), 2000);
        return txHash;
      } catch (err) {
        if (mountedRef.current) {
          setRemovingOfferIds(prev => {
            const next = new Set(prev);
            next.delete(offer.id);
            return next;
          });
          setError(ERROR_MESSAGES.CANCEL_OFFER_FAILED);
        }
        console.error('Failed to cancel offer:', err);
        throw err;
      }
    },
    [userAddress, fetchActiveOffers]
  );

  const editOffer = useCallback(
    async (offer: ActiveOffer, walletProvider: any, newAmount: string, newPrice: string) => {
      if (!userAddress) throw new Error(ERROR_MESSAGES.NO_WALLET_CONNECTED);
      if (!walletProvider) throw new Error('Wallet provider not available');
      if (parseFloat(newAmount) <= 0 || parseFloat(newPrice) <= 0)
        throw new Error('Amount and price must be positive');

      setIsLoadingActive(true);
      setError(null);

      try {
        const tx = await serviceRef.current.buildEditOfferTransaction(
          userAddress,
          offer,
          newAmount,
          newPrice
        );
        const txHash = await serviceRef.current.executeEditOfferWithWalletConnect(
          tx,
          walletProvider
        );
        setTimeout(() => fetchActiveOffers(), 2000);
        return txHash;
      } catch (err) {
        setError('Failed to edit offer');
        console.error('Failed to edit offer:', err);
        throw err;
      } finally {
        if (mountedRef.current) setIsLoadingActive(false);
      }
    },
    [userAddress, fetchActiveOffers]
  );

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
    isLoadingActive,
    isLoadingCompleted,
    error,
    isStreaming: false,
    newOfferIds,
    removingOfferIds,
    fetchActiveOffers,
    fetchCompletedTrades,
    cancelOffer,
    editOffer,
    reset,
  };
}
