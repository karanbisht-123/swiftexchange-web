import { useCallback, useEffect, useState } from 'react';

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

      setTrades(formattedTrades);
    } catch (err) {
      console.error('Failed to fetch recent trades:', err);
      setError('Failed to load recent trades');
    } finally {
      setIsLoading(false);
    }
  }, [baseAsset, counterAsset, currentNetwork]);

  useEffect(() => {
    fetchTrades();
    const interval = setInterval(fetchTrades, 15000);
    return () => clearInterval(interval);
  }, [fetchTrades]);

  return { trades, isLoading, error, refresh: fetchTrades };
};
