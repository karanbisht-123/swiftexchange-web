import { useCallback, useEffect, useRef, useState } from 'react';

import * as StellarSDK from '@stellar/stellar-sdk';

import { getStellarConfig } from '../../walletconnect/config/chains';
import { useWalletStore } from '../../walletconnect/store/walletConnectStore';

export interface RecentTrade {
  id: string;
  time: string;
  price: string;
  amount: string;
  isBuy: boolean;
}

interface UseRecentTradesProps {
  baseAsset?: { code: string; issuer?: string };
  counterAsset?: { code: string; issuer?: string };
}

export const useRecentTrades = ({ baseAsset, counterAsset }: UseRecentTradesProps) => {
  const currentNetwork = useWalletStore(state => state.network);
  const [trades, setTrades] = useState<RecentTrade[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Track which trade IDs are "new" so UI can animate them in
  const [newTradeIds, setNewTradeIds] = useState<Set<string>>(new Set());
  const knownIdsRef = useRef<Set<string>>(new Set());
  const mountedRef = useRef(true);

  const fetchTrades = useCallback(async () => {
    if (!baseAsset || !counterAsset) return;

    setIsLoading(true);
    setError(null);

    try {
      const config = getStellarConfig(currentNetwork);
      const server = new StellarSDK.Horizon.Server(config.horizonUrl);

      const base = baseAsset.issuer
        ? new StellarSDK.Asset(baseAsset.code, baseAsset.issuer)
        : StellarSDK.Asset.native();

      const counter = counterAsset.issuer
        ? new StellarSDK.Asset(counterAsset.code, counterAsset.issuer)
        : StellarSDK.Asset.native();

      const tradeResponse = await server
        .trades()
        .forAssetPair(base, counter)
        .order('desc')
        .limit(20)
        .call();

      const formattedTrades: RecentTrade[] = tradeResponse.records.map((record: any) => {
        const isBuy = !record.base_is_seller;
        return {
          id: record.id,
          time: record.ledger_close_time,
          price: (parseFloat(record.price.n) / parseFloat(record.price.d)).toFixed(7),
          amount: record.base_amount,
          isBuy,
        };
      });

      if (!mountedRef.current) return;

      // Flash newly seen trades
      const freshIds = formattedTrades
        .filter(t => !knownIdsRef.current.has(t.id))
        .map(t => t.id);

      if (freshIds.length > 0 && knownIdsRef.current.size > 0) {
        setNewTradeIds(new Set(freshIds));
        setTimeout(() => {
          if (mountedRef.current) setNewTradeIds(new Set());
        }, 2000);
      }

      formattedTrades.forEach(t => knownIdsRef.current.add(t.id));
      setTrades(formattedTrades);
    } catch (err) {
      console.error('Failed to fetch recent trades:', err);
      if (mountedRef.current) setError('Failed to load recent trades');
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, [baseAsset, counterAsset, currentNetwork]);

  // Initial fetch + 5 s polling (reduced from 15 s)
  useEffect(() => {
    mountedRef.current = true;
    fetchTrades();
    const interval = setInterval(fetchTrades, 5000);
    return () => {
      clearInterval(interval);
      mountedRef.current = false;
    };
  }, [fetchTrades]);

  // Also refresh immediately when an order is placed
  useEffect(() => {
    const handler = () => {
      setTimeout(() => fetchTrades(), 1500);
    };
    window.addEventListener('stellar:order-placed', handler);
    return () => window.removeEventListener('stellar:order-placed', handler);
  }, [fetchTrades]);

  return { trades, isLoading, error, newTradeIds, refresh: fetchTrades };
};
