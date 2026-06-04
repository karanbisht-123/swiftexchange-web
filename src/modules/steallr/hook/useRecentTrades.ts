import { useCallback, useEffect, useRef, useState } from 'react';

import * as StellarSDK from '@stellar/stellar-sdk';

import { getStellarConfig } from '../../walletconnect/config/chains';
import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import { RecentTradesService, type RecentTrade } from '../service/recentTradesService';
import {
  BinanceBridgeService,
  isBinanceSupported,
  isFlippedPair,
  getBinanceSymbol,
} from '../service/binanceBridgeService';

interface UseRecentTradesProps {
  baseAsset?: { code: string; issuer?: string };
  counterAsset?: { code: string; issuer?: string };
}

const globalTradesCache = new Map<string, RecentTrade[]>();

const getCacheKey = (base?: { code: string; issuer?: string }, counter?: { code: string; issuer?: string }) => {
  if (!base || !counter) return '';
  return `${base.code}-${base.issuer || ''}-${counter.code}-${counter.issuer || ''}`;
};

export const useRecentTrades = ({ baseAsset, counterAsset }: UseRecentTradesProps) => {
  const currentNetwork = useWalletStore(state => state.network);
  const cacheKey = getCacheKey(baseAsset, counterAsset);
  const [trades, setTrades] = useState<RecentTrade[]>(globalTradesCache.get(cacheKey) || []);
  const [isLoading, setIsLoading] = useState(!globalTradesCache.has(cacheKey));
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newTradeIds, setNewTradeIds] = useState<Set<string>>(new Set());

  const mountedRef = useRef(true);
  const streamCloseRef = useRef<(() => void) | null>(null);

  const [binanceActive, setBinanceActive] = useState(() =>
    isBinanceSupported(baseAsset?.code || '', counterAsset?.code || '')
  );

  useEffect(() => {
    setBinanceActive(isBinanceSupported(baseAsset?.code || '', counterAsset?.code || ''));
  }, [baseAsset?.code, counterAsset?.code]);

  useEffect(() => {
    const handleFallback = () => {
      setBinanceActive(false);
    };
    window.addEventListener('binance:connection-failed', handleFallback);
    return () => window.removeEventListener('binance:connection-failed', handleFallback);
  }, []);

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

      const updated = [newTrade, ...prev].slice(0, 50);
      const key = getCacheKey(baseAsset, counterAsset);
      if (key) globalTradesCache.set(key, updated);
      return updated;
    });
  }, [baseAsset, counterAsset]);

  const fetchTrades = useCallback(async () => {
    if (!baseAsset?.code || !counterAsset?.code) return;

    setIsLoading(true);
    setError(null);

    try {
      const base = baseAsset.code;
      const counter = counterAsset.code;

      const symbol = getBinanceSymbol(base, counter);

      if (binanceActive && symbol) {
        const isFlipped = isFlippedPair(base, counter);

        const formattedTrades = await BinanceBridgeService.fetchRecentTrades(symbol, isFlipped, 50);

        if (mountedRef.current) {
          setTrades(formattedTrades);
          const key = getCacheKey(baseAsset, counterAsset);
          if (key) globalTradesCache.set(key, formattedTrades);
        }
      } else {
        if (!serviceRef.current) return;
        const stellarBase = baseAsset.issuer
          ? new StellarSDK.Asset(baseAsset.code, baseAsset.issuer)
          : StellarSDK.Asset.native();

        const stellarCounter = counterAsset.issuer
          ? new StellarSDK.Asset(counterAsset.code, counterAsset.issuer)
          : StellarSDK.Asset.native();

        const formattedTrades = await serviceRef.current.getRecentTrades(stellarBase, stellarCounter, 50);

        if (mountedRef.current) {
          setTrades(formattedTrades);
          const key = getCacheKey(baseAsset, counterAsset);
          if (key) globalTradesCache.set(key, formattedTrades);
        }
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
    currentNetwork,
    binanceActive
  ]);

  const startStreaming = useCallback(() => {
    if (!baseAsset?.code || !counterAsset?.code) return;

    if (streamCloseRef.current) {
      streamCloseRef.current();
      streamCloseRef.current = null;
    }

    try {
      const base = baseAsset.code;
      const counter = counterAsset.code;

      const symbol = getBinanceSymbol(base, counter);

      if (binanceActive && symbol) {
        const isFlipped = isFlippedPair(base, counter);

        streamCloseRef.current = BinanceBridgeService.streamRecentTrades(
          symbol,
          isFlipped,
          handleNewTrade,
          () => { if (mountedRef.current) setIsStreaming(false); }
        );
        if (mountedRef.current) setIsStreaming(true);
      } else {
        if (!serviceRef.current) return;
        const stellarBase = baseAsset.issuer
          ? new StellarSDK.Asset(baseAsset.code, baseAsset.issuer)
          : StellarSDK.Asset.native();

        const stellarCounter = counterAsset.issuer
          ? new StellarSDK.Asset(counterAsset.code, counterAsset.issuer)
          : StellarSDK.Asset.native();

        streamCloseRef.current = serviceRef.current.streamRecentTrades(
          stellarBase,
          stellarCounter,
          handleNewTrade,
          () => { if (mountedRef.current) setIsStreaming(false); }
        );
        if (mountedRef.current) setIsStreaming(true);
      }
    } catch (err) {
      console.warn('[useRecentTrades] Stream failed to start', err);
      if (mountedRef.current) setIsStreaming(false);
    }
  }, [
    baseAsset?.code,
    baseAsset?.issuer,
    counterAsset?.code,
    counterAsset?.issuer,
    currentNetwork,
    handleNewTrade,
    binanceActive
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

  return { trades, isLoading, isStreaming, error, newTradeIds, refresh: fetchTrades };
};
