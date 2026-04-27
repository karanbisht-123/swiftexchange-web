import { useCallback, useEffect, useRef, useState } from 'react';

import * as StellarSDK from '@stellar/stellar-sdk';

import { getStellarConfig } from '../../walletconnect/config/chains';
import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import { RecentTradesService, type RecentTrade } from '../service/recentTradesService';

interface UseRecentTradesProps {
  baseAsset?: { code: string; issuer?: string };
  counterAsset?: { code: string; issuer?: string };
}

export const useRecentTrades = ({ baseAsset, counterAsset }: UseRecentTradesProps) => {
  const currentNetwork = useWalletStore(state => state.network);
  const [trades, setTrades] = useState<RecentTrade[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newTradeIds, setNewTradeIds] = useState<Set<string>>(new Set());

  const mountedRef = useRef(true);
  const streamCloseRef = useRef<(() => void) | null>(null);

  const serviceRef = useRef<RecentTradesService | null>(null);
  useEffect(() => {
    const config = getStellarConfig(currentNetwork);
    serviceRef.current = new RecentTradesService(
      config.horizonUrl,
      config.networkPassphrase,
      config.chainId
    );
  }, [currentNetwork]);


  const handleNewTrade = useCallback((newTrade: RecentTrade) => {
    if (!mountedRef.current) return;

    setTrades(prev => {
      if (prev.some(t => t.id === newTrade.id)) return prev;


      setNewTradeIds(ids => {
        const next = new Set(ids);
        next.add(newTrade.id);
        return next;
      });

      setTimeout(() => {
        if (mountedRef.current) {
          setNewTradeIds(ids => {
            const next = new Set(ids);
            next.delete(newTrade.id);
            return next;
          });
        }
      }, 2000);

      return [newTrade, ...prev].slice(0, 50);
    });
  }, []);

  const fetchTrades = useCallback(async () => {
    if (!baseAsset?.code || !counterAsset?.code || !serviceRef.current) return;

    setIsLoading(true);
    setError(null);

    try {
      const base = baseAsset.issuer
        ? new StellarSDK.Asset(baseAsset.code, baseAsset.issuer)
        : StellarSDK.Asset.native();

      const counter = counterAsset.issuer
        ? new StellarSDK.Asset(counterAsset.code, counterAsset.issuer)
        : StellarSDK.Asset.native();

      const formattedTrades = await serviceRef.current.getRecentTrades(base, counter, 50);

      if (mountedRef.current) {
        setTrades(formattedTrades);
      }
    } catch (err) {
      console.error('[useRecentTrades] Fetch failed:', err);
      if (mountedRef.current) setError('Failed to load recent trades');
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, [
    baseAsset?.code,
    baseAsset?.issuer,
    counterAsset?.code,
    counterAsset?.issuer,
    currentNetwork
  ]);

  const startStreaming = useCallback(() => {
    if (!baseAsset?.code || !counterAsset?.code || !serviceRef.current) return;

    if (streamCloseRef.current) {
      streamCloseRef.current();
      streamCloseRef.current = null;
    }

    try {
      const base = baseAsset.issuer
        ? new StellarSDK.Asset(baseAsset.code, baseAsset.issuer)
        : StellarSDK.Asset.native();

      const counter = counterAsset.issuer
        ? new StellarSDK.Asset(counterAsset.code, counterAsset.issuer)
        : StellarSDK.Asset.native();

      streamCloseRef.current = serviceRef.current.streamRecentTrades(
        base,
        counter,
        handleNewTrade
      );
    } catch (err) {
      console.warn('[useRecentTrades] Stream failed to start', err);
    }
  }, [
    baseAsset?.code,
    baseAsset?.issuer,
    counterAsset?.code,
    counterAsset?.issuer,
    currentNetwork,
    handleNewTrade
  ]);

  useEffect(() => {
    mountedRef.current = true;
    fetchTrades();
    startStreaming();

    return () => {
      mountedRef.current = false;
      if (streamCloseRef.current) {
        streamCloseRef.current();
        streamCloseRef.current = null;
      }
    };
  }, [fetchTrades, startStreaming]);


  useEffect(() => {
    const handler = () => {
      setTimeout(() => fetchTrades(), 1500);
    };
    window.addEventListener('stellar:order-placed', handler);
    return () => window.removeEventListener('stellar:order-placed', handler);
  }, [fetchTrades]);

  return { trades, isLoading, error, newTradeIds, refresh: fetchTrades };
};
