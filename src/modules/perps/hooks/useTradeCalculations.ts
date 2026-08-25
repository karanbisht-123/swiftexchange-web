import { useMemo } from 'react';
import { useAccountStore } from '../core/stores/accountStore';
import { usePositionStore } from '../core/stores/positionStore';
import { useLeverageStore } from '../core/stores/leverageStore';
import { useTickerStore } from '../core/stores/tickerStore';

export function useTradeCalculations(
  symbol: string,
  inputSize: string,
  sizeAsset: 'base' | 'quote',
  leverage: number,
  marginType: 'cross' | 'isolated'
) {
  const balances = useAccountStore(state => state.balances);
  const positions = usePositionStore(state => state.positions);
  const bracketsBySymbol = useLeverageStore(state => state.bracketsBySymbol);
  const assetCtxByMarket = useTickerStore(state => state.assetCtxByMarket);

  const multiAssetsMargin = useAccountStore(state => state.multiAssetsMargin);

  const parsedSize = parseFloat(inputSize) || 0;
  const currentPrice = parseFloat(assetCtxByMarket[symbol]?.markPx || '0');
  
  // Wallet Balance
  const walletBalance = useMemo(() => {
    if (!multiAssetsMargin) {
      // In Single-Asset Mode, your buying power is only the settlement currency (USDT)
      const quoteAsset = symbol.split('-')[1] || 'USDT';
      const quoteBal = balances[quoteAsset];
      return quoteBal ? parseFloat(quoteBal.total) : 0;
    }

    // In Multi-Asset Mode, it's the total equity across all supported assets
    return Object.values(balances).reduce((acc, b) => {
      let price = 1;
      if (b.asset !== 'USDT' && b.asset !== 'USDC') {
        const markPrice = assetCtxByMarket[`${b.asset}-USDT`]?.markPx || assetCtxByMarket[`${b.asset}USDT`]?.markPx;
        if (markPrice) price = parseFloat(markPrice);
        else price = 0;
      }
      return acc + (parseFloat(b.total) * price);
    }, 0);
  }, [balances, assetCtxByMarket, multiAssetsMargin, symbol]);

  // Max Position Size Calculation (0% to 100% slider bounds)
  const maxPossibleSize = useMemo(() => {
    if (currentPrice === 0 || walletBalance <= 0) return 0;
    // Apply a slight safety buffer (e.g. 99%) so we don't immediately liquidate on fees
    const maxNotional = walletBalance * leverage * 0.99;
    return sizeAsset === 'quote' ? maxNotional : maxNotional / currentPrice;
  }, [walletBalance, leverage, currentPrice, sizeAsset]);

  // Order Cost (Required Margin)
  const orderCost = useMemo(() => {
    if (currentPrice <= 0 || parsedSize <= 0) return 0;
    
    // If input is in Quote asset (USDT), then parsedSize is the notional value.
    // If input is in Base asset (BTC), then parsedSize * currentPrice is the notional value.
    const notional = sizeAsset === 'quote' ? parsedSize : parsedSize * currentPrice;
    
    return notional / leverage;
  }, [currentPrice, parsedSize, leverage, sizeAsset]);

  // --- CROSS MARGIN CALCULATIONS ---
  // Cross Account Equity = walletBalance + sum(unrealizedPnL of all cross positions)
  const crossAccountEquity = useMemo(() => {
    const crossPositions = Object.values(positions).filter(p => p.marginType === 'cross');
    const totalPnl = crossPositions.reduce((acc, p) => acc + parseFloat(p.unrealizedPnl || '0'), 0);
    return walletBalance + totalPnl;
  }, [positions, walletBalance]);

  // Total Maintenance Margin = sum(MM_i) for every open cross position
  // MM_i = positionNotional_i * maintMarginRatio_i - cum_i
  const totalMaintenanceMargin = useMemo(() => {
    const crossPositions = Object.values(positions).filter(p => p.marginType === 'cross');
    
    return crossPositions.reduce((acc, p) => {
      const symNoDash = p.symbol.replace('-', '');
      const brackets = bracketsBySymbol[symNoDash];
      if (!brackets || brackets.length === 0) return acc; // No bracket data, can't calc

      const notional = Math.abs(parseFloat(p.size)) * parseFloat(p.markPrice || '0');
      
      // Find the appropriate bracket for the notional
      const bracket = brackets.find(b => notional <= b.notionalCap) || brackets[brackets.length - 1];
      
      const mm = (notional * bracket.maintMarginRatio) - bracket.cum;
      return acc + Math.max(0, mm);
    }, 0);
  }, [positions, bracketsBySymbol]);

  // Cross Margin Ratio
  const crossMarginRatio = crossAccountEquity > 0 
    ? (totalMaintenanceMargin / crossAccountEquity) * 100 
    : 0;

  // --- ISOLATED MARGIN CALCULATIONS (Estimate for the new order) ---
  // Isolated Liq Price = Entry Price - (Entry Price / Leverage) + MMR * Entry Price (For LONG)
  // Actually, MMR depends on notional.
  const estimatedIsolatedLiqPrice = useMemo(() => {
    if (currentPrice === 0 || parsedSize === 0 || marginType !== 'isolated') return { long: null, short: null };
    
    const symNoDash = symbol.replace('-', '');
    const brackets = bracketsBySymbol[symNoDash];
    const notional = sizeAsset === 'quote' ? parsedSize : parsedSize * currentPrice;
    
    let mmr = 0.005; // Fallback 0.5%
    if (brackets && brackets.length > 0) {
      const bracket = brackets.find(b => notional <= b.notionalCap) || brackets[brackets.length - 1];
      mmr = bracket.maintMarginRatio;
    }

    // Rough formula. For exact Binance formula:
    // Long Liq = (Margin - Cum - Entry * Size) / (Size * (MMR - 1))
    // Simplification for UI preview:
    const longLiq = currentPrice - (currentPrice / leverage) + (mmr * currentPrice);
    const shortLiq = currentPrice + (currentPrice / leverage) - (mmr * currentPrice);
    
    return {
      long: Math.max(0, longLiq),
      short: Math.max(0, shortLiq)
    };
  }, [symbol, currentPrice, parsedSize, marginType, leverage, bracketsBySymbol]);

  return {
    walletBalance,
    maxPossibleSize,
    orderCost,
    crossAccountEquity,
    totalMaintenanceMargin,
    crossMarginRatio,
    estimatedIsolatedLiqPrice,
    currentPrice
  };
}
