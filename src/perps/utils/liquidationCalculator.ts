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
  const size = parseFloat(position.size || '0');
  const entryPrice = parseFloat(position.entryPrice || '0');

  if (size === 0 || entryPrice <= 0) return null;

  const isLong = size > 0;
  const absSize = Math.abs(size);
  const notional = absSize * entryPrice;

  const { maintMarginRatio: mmr, cum } = getBracketForNotional(
    position.symbol,
    notional,
    bracketsBySymbol
  );

  // 1. Isolated Margin Mode
  if (position.marginType === 'isolated') {
    let isolatedMargin = parseFloat(position.isolatedMargin || '0');
    if (isolatedMargin <= 0 && position.leverage > 0) {
      isolatedMargin = notional / position.leverage;
    }

    if (isLong) {
      const denom = absSize * (1 - mmr);
      if (denom <= 0) return null;
      const liqPrice = (entryPrice * absSize - isolatedMargin + cum) / denom;
      return liqPrice > 0 ? liqPrice : null;
    } else {
      const denom = absSize * (1 + mmr);
      if (denom <= 0) return null;
      const liqPrice = (entryPrice * absSize + isolatedMargin - cum) / denom;
      return liqPrice > 0 ? liqPrice : null;
    }
  }

  // 2. Cross Margin Mode
  // If API already provided a valid non-zero liquidation price for Cross, we can check it
  const apiLiq = parseFloat(position.liquidationPrice || '0');

  // Convert balances to map if array
  let balanceMap: Record<string, AccountBalance> = {};
  if (Array.isArray(balances)) {
    balances.forEach(b => {
      balanceMap[b.asset] = b;
    });
  } else if (balances && typeof balances === 'object') {
    balanceMap = balances;
  }

  // Calculate Cross Wallet Balance
  let crossWalletBalance = 0;
  if (isMultiAsset) {
    // Multi-asset mode: sum total margin balance across all assets
    Object.values(balanceMap).forEach(b => {
      const total = parseFloat(b.total || b.marginBalance || '0');
      if (total > 0) crossWalletBalance += total;
    });
  } else {
    // Single-asset mode (USDT-M)
    const usdtBal = balanceMap['USDT'] || balanceMap['USD'];
    if (usdtBal) {
      crossWalletBalance = parseFloat(usdtBal.total || usdtBal.marginBalance || '0');
    }
  }

  // If no balance loaded yet and API gave a liq price, fallback to API
  if (crossWalletBalance <= 0 && apiLiq > 0) {
    return apiLiq;
  }

  // Calculate other cross positions' maintenance margin and unrealized PnL
  let otherMaintMargin = 0;
  let otherUnrealizedPnl = 0;

  const targetNormSymbol = normalizeSymbol(position.symbol);

  allPositions.forEach(p => {
    if (normalizeSymbol(p.symbol) === targetNormSymbol) return; // Skip current position
    if (p.marginType === 'isolated') return; // Skip isolated positions

    const pSize = Math.abs(parseFloat(p.size || '0'));
    const pEntry = parseFloat(p.entryPrice || '0');
    const pMark = parseFloat(p.markPrice || '0') || pEntry;
    const pNotional = pSize * pMark;

    if (pNotional > 0) {
      const pBracket = getBracketForNotional(p.symbol, pNotional, bracketsBySymbol);
      otherMaintMargin += Math.max(0, pNotional * pBracket.maintMarginRatio - pBracket.cum);
      otherUnrealizedPnl += parseFloat(p.unrealizedPnl || '0');
    }
  });

  const availableCollateral = crossWalletBalance + otherUnrealizedPnl - otherMaintMargin;

  if (isLong) {
    const denom = absSize * (1 - mmr);
    if (denom <= 0) return null;
    const liqPrice = (entryPrice * absSize - availableCollateral + cum) / denom;
    return liqPrice > 0 ? liqPrice : null;
  } else {
    const denom = absSize * (1 + mmr);
    if (denom <= 0) return null;
    const liqPrice = (entryPrice * absSize + availableCollateral - cum) / denom;
    return liqPrice > 0 ? liqPrice : null;
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
  const val = typeof price === 'number' ? price : parseFloat(price);
  if (isNaN(val) || val <= 0) return '--';

  // If explicit tickSize is provided, determine decimal count
  if (tickSize) {
    const tickStr = String(tickSize);
    if (tickStr.includes('.')) {
      const decimals = tickStr.split('.')[1].length;
      return val.toFixed(decimals);
    }
  }

  // Dynamic smart precision
  if (val >= 1000) return val.toFixed(2);
  if (val >= 100) return val.toFixed(2);
  if (val >= 10) return val.toFixed(3);
  if (val >= 1) return val.toFixed(4);
  if (val >= 0.01) return val.toFixed(5);
  return val.toFixed(6);
}
