import { useEffect, useRef, useState } from 'react';
import { HyperliquidClient } from '../adapters/hyperliquid';
import { AsterClient } from '../adapters/aster/client';
import { marketStore, useMarketStore } from '../core/stores/marketStore';
import { useExchangeManager } from '../core/ExchangeManager';
import { useLeverageStore } from '../core/stores/leverageStore';
import { getBrackets } from '../adapters/aster/api/funding';
import type { PerpExchange } from '../core/interfaces/exchange';

export function useDynamicExchange() {
  const currentExchange = useExchangeManager((state) => state.currentExchange);
  const clientRef = useRef<PerpExchange | null>(null);
  const [activeClient, setActiveClient] = useState<PerpExchange | null>(null);

  // Re-initialize the exchange client whenever the selected exchange changes
  useEffect(() => {
    // Cancellation flag guards against race conditions when the exchange changes
    // before a pending async getMarkets() call completes.
    let cancelled = false;

    const init = async () => {
      if (clientRef.current) {
        await clientRef.current.disconnect();
        clientRef.current = null;
        setActiveClient(null);
      }

      const client: PerpExchange =
        currentExchange === 'aster' ? new AsterClient() : new HyperliquidClient();

      clientRef.current = client;
      await client.connect();

      if (cancelled) {
        return;
      }

      const markets = await client.getMarkets();
      if (cancelled) return;

      marketStore.setMarkets(markets);
      
      if (currentExchange === 'aster') {
        getBrackets().then(bracketsData => {
          if (cancelled) return;
          const bracketsMap: Record<string, any[]> = {};
          bracketsData.forEach((lb: any) => {
            bracketsMap[lb.symbol] = (lb.riskBrackets || []).map((rb: any) => ({
              bracket: rb.bracketSeq,
              initialLeverage: rb.maxOpenPosLeverage,
              notionalCap: rb.bracketNotionalCap,
              notionalFloor: rb.bracketNotionalFloor,
              maintMarginRatio: rb.bracketMaintenanceMarginRate,
              cum: rb.cumFastMaintenanceAmount,
            }));
          });
          useLeverageStore.getState().setAllBrackets(bracketsMap);
        }).catch(err => console.error('[useDynamicExchange] getBrackets failed:', err));
      }

      if (markets.length === 0) return;

      // Determine best symbol after exchange switch:
      // 1. Keep current if it exists on the new exchange.
      // 2. Match by base asset (e.g. ETH-USDC → ETH-USDT).
      // 3. Fall back to first available market.
      const currentSym = marketStore.getSelectedSymbol();
      const symbolSet = new Set(markets.map((m) => m.symbol));

      let nextSymbol = currentSym;
      if (!symbolSet.has(currentSym)) {
        const base = currentSym.split('-')[0];
        const match = markets.find((m) => m.symbol.startsWith(base + '-'));
        nextSymbol = match ? match.symbol : markets[0].symbol;
      }

      // setSelectedSymbol is a no-op if symbol hasn't changed, avoiding a
      // redundant Zustand update + subscription trigger
      marketStore.setSelectedSymbol(nextSymbol);
      subscribeToSymbol(client, nextSymbol);
      
      if (!cancelled) {
        setActiveClient(client);
      }
    };

    init().catch((err) => {
      if (!cancelled) console.error('[useDynamicExchange] init failed:', err);
    });

    return () => {
      cancelled = true;
      clientRef.current?.disconnect();
      clientRef.current = null;
      setActiveClient(null);
    };
  }, [currentExchange]);

  // Re-subscribe to data feeds when the selected symbol changes
  useEffect(() => {
    let prevSymbol = useMarketStore.getState().selectedSymbol;

    const unsubscribe = useMarketStore.subscribe((state) => {
      const symbol = state.selectedSymbol;
      const client = clientRef.current;
      if (!client || symbol === prevSymbol) return;

      subscribeToSymbol(client, symbol);
      prevSymbol = symbol;
    });

    return unsubscribe;
  }, []);

  return { client: activeClient };
}

function subscribeToSymbol(client: PerpExchange, symbol: string): void {
  client.subscribeOrderBook(symbol);
  client.subscribeTicker(symbol);
}
