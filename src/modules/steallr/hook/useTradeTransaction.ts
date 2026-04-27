import { useCallback, useEffect, useRef, useState } from 'react';

import * as StellarSDK from '@stellar/stellar-sdk';

import { getStellarConfig } from '../../walletconnect/config/chains';
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
  const [service, setService] = useState(() => new TradeTransactionService());

  useEffect(() => {
    setService(new TradeTransactionService());
  }, [currentNetwork]);

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
  const [isStreaming, setIsStreaming] = useState(false);


  const [newOfferIds, setNewOfferIds] = useState<Set<string>>(new Set());
  const [removingOfferIds, setRemovingOfferIds] = useState<Set<string>>(new Set());


  const offersStreamRef = useRef<(() => void) | null>(null);
  const tradesStreamRef = useRef<(() => void) | null>(null);
  const mountedRef = useRef(true);

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
        if (!mountedRef.current) return;
        setActiveOffers(prev => {
          if (cursor) return [...prev, ...offers];
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
          return offers;
        });
        setActivePagination({ cursor: nextCursor, hasMore });
      } catch (err) {
        if (mountedRef.current) {
          setError(ERROR_MESSAGES.LOAD_ACTIVE_OFFERS_FAILED);
          console.error('Failed to fetch active offers:', err);
        }
      } finally {
        if (mountedRef.current) setIsLoading(false);
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
        if (!mountedRef.current) return;
        setCompletedTrades(prev => (cursor ? [...prev, ...trades] : trades));
        setCompletedPagination({ cursor: nextCursor, hasMore });
      } catch (err) {
        if (mountedRef.current) {
          setError(ERROR_MESSAGES.LOAD_COMPLETED_TRADES_FAILED);
          console.error('Failed to fetch completed trades:', err);
        }
      } finally {
        if (mountedRef.current) setIsLoading(false);
      }
    },
    [userAddress, service]
  );


  const startStreaming = useCallback(() => {
    if (!userAddress || !StellarSDK.StrKey.isValidEd25519PublicKey(userAddress)) return;

    // Cleanup existing streams
    if (offersStreamRef.current) {
      offersStreamRef.current();
      offersStreamRef.current = null;
    }
    if (tradesStreamRef.current) {
      tradesStreamRef.current();
      tradesStreamRef.current = null;
    }

    try {
      const config = getStellarConfig(currentNetwork);
      const serverOptions: any = {};
      if (config.horizonUrl.startsWith('http://')) serverOptions.allowHttp = true;
      const server = new StellarSDK.Horizon.Server(config.horizonUrl, serverOptions);

      // Offer stream
      const closeOffers = server
        .offers()
        .forAccount(userAddress)
        .cursor('now')
        .stream({
          onmessage: () => {
            if (!mountedRef.current) return;
            fetchActiveOffers();
          },
          onerror: () => {
            if (mountedRef.current) setIsStreaming(false);
          },
        }) as unknown as () => void;
      offersStreamRef.current = closeOffers;

      // Trades stream
      const closeTrades = server
        .trades()
        .forAccount(userAddress)
        .cursor('now')
        .stream({
          onmessage: () => {
            if (!mountedRef.current) return;
            fetchCompletedTrades();
          },
          onerror: () => {
            if (mountedRef.current) setIsStreaming(false);
          },
        }) as unknown as () => void;
      tradesStreamRef.current = closeTrades;

      if (mountedRef.current) setIsStreaming(true);
    } catch (err) {
      console.warn('[useTradeTransaction] SSE streaming failed to start:', err);
      if (mountedRef.current) setIsStreaming(false);
    }
  }, [userAddress, currentNetwork, fetchActiveOffers, fetchCompletedTrades]);


  useEffect(() => {
    if (isStreaming || !userAddress) return;
    const interval = setInterval(() => {
      fetchActiveOffers();
      fetchCompletedTrades();
    }, 8000);
    return () => clearInterval(interval);
  }, [isStreaming, userAddress, fetchActiveOffers, fetchCompletedTrades]);


  useEffect(() => {
    const handler = () => {
      setTimeout(() => {
        fetchActiveOffers();
        fetchCompletedTrades();
      }, 1500);
    };
    window.addEventListener('stellar:order-placed', handler);
    return () => window.removeEventListener('stellar:order-placed', handler);
  }, [fetchActiveOffers, fetchCompletedTrades]);


  useEffect(() => {
    mountedRef.current = true;
    if (userAddress) {
      fetchActiveOffers();
      fetchCompletedTrades();
      startStreaming();
    }
    return () => {
      mountedRef.current = false;
      offersStreamRef.current?.();
      tradesStreamRef.current?.();
    };
  }, [userAddress]);


  useEffect(() => {
    if (userAddress) startStreaming();
  }, [currentNetwork]);

  const cancelOffer = useCallback(
    async (offer: ActiveOffer, walletProvider: any) => {
      if (!userAddress) throw new Error(ERROR_MESSAGES.NO_WALLET_CONNECTED);
      if (!walletProvider) throw new Error('Wallet provider not available');

      setRemovingOfferIds(prev => new Set([...prev, offer.id]));
      setError(null);

      try {
        const tx = await service.buildCancelOfferTransaction(userAddress, offer);
        const txHash = await service.executeCancelOfferWithWalletConnect(tx, walletProvider);

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
    [userAddress, service, fetchActiveOffers]
  );

  const editOffer = useCallback(
    async (offer: ActiveOffer, walletProvider: any, newAmount: string, newPrice: string) => {
      if (!userAddress) throw new Error(ERROR_MESSAGES.NO_WALLET_CONNECTED);
      if (!walletProvider) throw new Error('Wallet provider not available');
      if (parseFloat(newAmount) <= 0 || parseFloat(newPrice) <= 0)
        throw new Error('Amount and price must be positive');

      setIsLoading(true);
      setError(null);

      try {
        const tx = await service.buildEditOfferTransaction(userAddress, offer, newAmount, newPrice);
        const txHash = await service.executeEditOfferWithWalletConnect(tx, walletProvider);
        setTimeout(() => fetchActiveOffers(), 2000);
        return txHash;
      } catch (err) {
        setError('Failed to edit offer');
        console.error('Failed to edit offer:', err);
        throw err;
      } finally {
        if (mountedRef.current) setIsLoading(false);
      }
    },
    [userAddress, service, fetchActiveOffers]
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
    isLoading,
    error,
    isStreaming,
    newOfferIds,
    removingOfferIds,
    fetchActiveOffers,
    fetchCompletedTrades,
    cancelOffer,
    editOffer,
    reset,
  };
}
