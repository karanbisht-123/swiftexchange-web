import BigNumber from 'bignumber.js';

import type { AccountBalance, Position } from '../core/models';
import type { LeverageBracket } from '../core/stores/leverageStore';

export interface LiqCalcParams {
  position: Position;
  allPositions?: Position[];
  balances?: Record<string, AccountBalance> | AccountBalance[];
  isMultiAsset?: boolean;
  bracketsBySymbol?: Record<string, LeverageBracket[]>;
}

/**
 * Normalizes symbol string to match bracket map keys (e.g. 'ASTER-USDT' -> 'ASTERUSDT')
 */
function normalizeSymbol(sym: string): string {
  return sym.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

/**
 * Finds the matching leverage/risk bracket for a given symbol and notional value
 */
export function getBracketForNotional(
  symbol: string,
  notional: number,
  bracketsBySymbol: Record<string, LeverageBracket[]> = {}
): { maintMarginRatio: number; cum: number } {
  const norm = normalizeSymbol(symbol);
  const brackets = bracketsBySymbol[norm] || bracketsBySymbol[symbol] || [];

  if (brackets.length > 0) {
    const matched = brackets.find(
      b =>
        notional >= (b.notionalFloor || 0) &&
        (b.notionalCap == null || b.notionalCap === 0 || notional <= b.notionalCap)
    );
    if (matched) {
      return {
        maintMarginRatio: matched.maintMarginRatio || 0.005,
        cum: matched.cum || 0,
      };
    }
    // Fallback to first bracket if notional exceeds or doesn't match
    const first = brackets[0];
    return {
      maintMarginRatio: first.maintMarginRatio || 0.005,
      cum: first.cum || 0,
    };
  }

  // Default fallback MMR (0.5% for Aster futures tier 1)
  return { maintMarginRatio: 0.005, cum: 0 };
}

/**
 * Calculates the exact Liquidation Price for Aster / Binance Futures perpetual positions
 * Handles Isolated, Cross Margin, Single-Asset, and Multi-Asset Margin modes.
 */
export function calculateLiquidationPrice({
  position,
  allPositions = [],
  balances = {},
  isMultiAsset = false,
  bracketsBySymbol = {},
}: LiqCalcParams): number | null {
  const size = new BigNumber(position.size || '0');
  const entryPrice = new BigNumber(position.entryPrice || '0');

  if (size.isZero() || entryPrice.lte(0)) return null;

  const isLong = size.gt(0);
  const absSize = size.abs();
  const notional = absSize.times(entryPrice);

  const { maintMarginRatio: mmr, cum } = getBracketForNotional(
    position.symbol,
    notional.toNumber(),
    bracketsBySymbol
  );

  const mmrBn = new BigNumber(mmr);
  const cumBn = new BigNumber(cum);

  // 1. Isolated Margin Mode
  if (position.marginType === 'isolated') {
    let isolatedMargin = new BigNumber(position.isolatedMargin || '0');
    if (isolatedMargin.lte(0) && position.leverage > 0) {
      isolatedMargin = notional.div(position.leverage);
    }

    if (isLong) {
      const denom = absSize.times(new BigNumber(1).minus(mmrBn));
      if (denom.lte(0)) return null;
      const liqPrice = entryPrice.times(absSize).minus(isolatedMargin).plus(cumBn).div(denom);
      return liqPrice.gt(0) ? liqPrice.toNumber() : null;
    } else {
      const denom = absSize.times(new BigNumber(1).plus(mmrBn));
      if (denom.lte(0)) return null;
      const liqPrice = entryPrice.times(absSize).plus(isolatedMargin).minus(cumBn).div(denom);
      return liqPrice.gt(0) ? liqPrice.toNumber() : null;
    }
  }

  // 2. Cross Margin Mode
  const apiLiq = new BigNumber(position.liquidationPrice || '0');

  // Convert balances to map if array
  let balanceMap: Record<string, AccountBalance> = {};
  if (Array.isArray(balances)) {
    balances.forEach(b => {
      balanceMap[b.asset] = b;
    });
  } else if (balances && typeof balances === 'object') {
    balanceMap = balances as Record<string, AccountBalance>;
  }

  // Calculate Cross Wallet Balance
  let crossWalletBalance = new BigNumber(0);
  if (isMultiAsset) {
    // Multi-asset mode: sum total margin balance across all assets
    Object.values(balanceMap).forEach(b => {
      const total = new BigNumber(b.total || b.marginBalance || '0');
      if (total.gt(0)) crossWalletBalance = crossWalletBalance.plus(total);
    });
  } else {
    // Single-asset mode (USDT-M)
    const usdtBal = balanceMap['USDT'] || balanceMap['USD'];
    if (usdtBal) {
      crossWalletBalance = new BigNumber(usdtBal.total || usdtBal.marginBalance || '0');
    }
  }

  // If no balance loaded yet and API gave a liq price, fallback to API
  if (crossWalletBalance.lte(0) && apiLiq.gt(0)) {
    return apiLiq.toNumber();
  }

  // Calculate other cross positions' maintenance margin and unrealized PnL
  let otherMaintMargin = new BigNumber(0);
  let otherUnrealizedPnl = new BigNumber(0);

  const targetNormSymbol = normalizeSymbol(position.symbol);

  allPositions.forEach(p => {
    if (normalizeSymbol(p.symbol) === targetNormSymbol) return; // Skip current position
    if (p.marginType === 'isolated') return; // Skip isolated positions

    const pSize = new BigNumber(p.size || '0').abs();
    const pEntry = new BigNumber(p.entryPrice || '0');
    const pMarkStr = p.markPrice || '0';
    const pMark = pMarkStr === '0' ? pEntry : new BigNumber(pMarkStr);
    const pNotional = pSize.times(pMark);

    if (pNotional.gt(0)) {
      const pBracket = getBracketForNotional(p.symbol, pNotional.toNumber(), bracketsBySymbol);
      const pMmrBn = new BigNumber(pBracket.maintMarginRatio);
      const pCumBn = new BigNumber(pBracket.cum);
      const mm = pNotional.times(pMmrBn).minus(pCumBn);
      if (mm.gt(0)) {
        otherMaintMargin = otherMaintMargin.plus(mm);
      }
      otherUnrealizedPnl = otherUnrealizedPnl.plus(new BigNumber(p.unrealizedPnl || '0'));
    }
  });

  const availableCollateral = crossWalletBalance.plus(otherUnrealizedPnl).minus(otherMaintMargin);

  if (isLong) {
    const denom = absSize.times(new BigNumber(1).minus(mmrBn));
    if (denom.lte(0)) return null;
    const liqPrice = entryPrice.times(absSize).minus(availableCollateral).plus(cumBn).div(denom);
    return liqPrice.gt(0) ? liqPrice.toNumber() : null;
  } else {
    const denom = absSize.times(new BigNumber(1).plus(mmrBn));
    if (denom.lte(0)) return null;
    const liqPrice = entryPrice.times(absSize).plus(availableCollateral).minus(cumBn).div(denom);
    return liqPrice.gt(0) ? liqPrice.toNumber() : null;
  }
}

/**
 * Formats a price with full accuracy matching exchange tick precision
 * Prevents premature truncation to 2 decimals on lower-priced assets (e.g. 0.60430)
 */
export function formatPricePrecision(
  price: number | string | null | undefined,
  tickSize?: number | string
): string {
  if (price === null || price === undefined) return '--';
  const bn = new BigNumber(price);
  if (bn.isNaN() || bn.lte(0)) return '--';

  // If explicit tickSize is provided, determine decimal count
  if (tickSize) {
    const tickStr = String(tickSize);
    if (tickStr.includes('.')) {
      const decimals = tickStr.split('.')[1].length;
      return bn.toFixed(decimals);
    }
  }

  // Dynamic smart precision
  if (bn.gte(1000)) return bn.toFixed(2);
  if (bn.gte(100)) return bn.toFixed(2);
  if (bn.gte(10)) return bn.toFixed(3);
  if (bn.gte(1)) return bn.toFixed(4);
  if (bn.gte(0.01)) return bn.toFixed(5);
  return bn.toFixed(6);
}
