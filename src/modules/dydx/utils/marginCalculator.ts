export interface AccountBalance {
  totalEquity: string;
  crossEquity: string;
  freeCollateral: string;
  marginUsage?: string;
}

export interface MarginCalculation {
  portfolioValue: number;
  availableBalance: number;
  marginUsed: number;
  marginUsagePercent: number;
  totalMarginRequired: number;
}

export interface OrderMarginImpact {
  initialMarginRequired: number;
  maintenanceMarginRequired: number;
  newAvailableBalance: number;
  newMarginUsage: number;
  newMarginUsed: number;
  notionalValue: number;
  canAfford: boolean;
  leverage: number;
}

/**
 * Calculate current account-level margin metrics from balance.
 *
 * Formula (from dYdX docs):
 *   Equity            = Q + Σ(Si × Pi)          — provided by dYdX as `totalEquity`
 *   TIMR              = Σ|Si × Pi × IMFi|        — implied: equity − freeCollateral
 *   Free collateral   = Equity − TIMR            — provided by dYdX as `freeCollateral`
 *   Margin used %     = TIMR / Equity × 100
 */
export const calculateCurrentMargin = (balance: AccountBalance | null): MarginCalculation => {
  if (!balance) {
    return {
      portfolioValue: 0,
      availableBalance: 0,
      marginUsed: 0,
      marginUsagePercent: 0,
      totalMarginRequired: 0,
    };
  }

  const equity = parseFloat(balance.totalEquity || '0');
  const freeCollateral = parseFloat(balance.freeCollateral || '0');
  const totalMarginRequired = Math.max(0, equity - freeCollateral);

  const marginUsagePercent =
    equity > 0 ? Math.max(0, Math.min(100, (totalMarginRequired / equity) * 100)) : 0;

  return {
    portfolioValue: equity,
    availableBalance: freeCollateral,
    marginUsed: totalMarginRequired,
    marginUsagePercent,
    totalMarginRequired,
  };
};

/**
 * Initial Margin Requirement for a single position.
 * IMR = |S × P × IMF|
 *   S   = position size (positive)
 *   P   = oracle / execution price
 *   IMF = initial margin fraction (e.g. 0.05 for 20× max leverage)
 */
export const calculateInitialMarginRequired = (
  size: number,
  price: number,
  initialMarginFraction: number
): number => {
  return Math.abs(size * price * initialMarginFraction);
};

/**
 * Maintenance Margin Requirement for a single position.
 * MMR = |S × P × MMF|
 *   MMF = maintenance margin fraction (e.g. 0.03)
 */
export const calculateMaintenanceMarginRequired = (
  size: number,
  price: number,
  maintenanceMarginFraction: number
): number => {
  return Math.abs(size * price * maintenanceMarginFraction);
};

/**
 * Post-order margin impact — used by the order receipt preview.
 *
 * How it works:
 *   notional          = |size × price|
 *   IMR               = notional × IMF   (margin locked for this order)
 *   newFreeCollateral = currentFree − IMR
 *   newMarginUsed     = equity − newFreeCollateral
 *   newMarginUsage %  = newMarginUsed / equity × 100

 */
export const calculateOrderMarginImpact = (
  currentEquity: number,
  currentFree: number,
  orderSize: number,
  orderPrice: number,
  leverage: number,
  initialMarginFraction: number,
  maintenanceMarginFraction?: number
): OrderMarginImpact => {

  const notionalValue = Math.abs(orderSize * orderPrice);
  const initialMarginRequired = Math.abs(orderSize * orderPrice * initialMarginFraction);

  // Use actual maintenance margin fraction if available, otherwise fall back to typical dYdX 60% of IMR
  const maintenanceMarginRequired = maintenanceMarginFraction !== undefined
    ? Math.abs(orderSize * orderPrice * maintenanceMarginFraction)
    : initialMarginRequired * 0.6;

  const newAvailableBalance = currentFree - initialMarginRequired;
  const newMarginUsed = currentEquity - Math.max(0, newAvailableBalance);

  const newMarginUsage =
    currentEquity > 0
      ? Math.max(0, Math.min(100, (newMarginUsed / currentEquity) * 100))
      : 0;

  return {
    initialMarginRequired,
    maintenanceMarginRequired,
    newAvailableBalance: Math.max(0, newAvailableBalance),
    newMarginUsage,
    newMarginUsed: Math.max(0, newMarginUsed),
    notionalValue,
    canAfford: newAvailableBalance >= 0,
    leverage,
  };
};

/**
 * Liquidation price for an ISOLATED position.
 *
 * Formula: p' = (e − s×p) / (|s|×MMF − s)
 *   e   = subaccount equity (= collateral allocated to this isolated sub)
 *   s   = signed size: positive for LONG, negative for SHORT
 *   p   = entry price
 *   MMF = maintenance margin fraction
 *
 * Example (LONG 0.5 ETH at $3000, equity $150, MMF 0.03):
 *   s = 0.5, p = 3000, e = 150
 *   p' = (150 − 0.5×3000) / (0.5×0.03 − 0.5) = (150−1500)/(0.015−0.5) = −1350/−0.485 ≈ $2,783
 */
export const calculateIsolatedLiquidationPrice = (
  size: number,
  price: number,
  equity: number,
  maintenanceMarginFraction: number,
  side: 'BUY' | 'SELL'
): number => {

  const s = side === 'BUY' ? size : -size;
  const denominator = size * maintenanceMarginFraction - s;

  if (Math.abs(denominator) < 1e-12) return 0;

  const liqPrice = (equity - s * price) / denominator;
  return Math.max(0, liqPrice);
};

/**
 * Liquidation price for a CROSS position.
 *
 * Formula: p' = (e − s×p − MMR_o) / (|s|×MMF − s)
 *   e     = total cross account equity
 *   s     = signed size of THIS position (positive = long)
 *   p     = entry price of THIS position
 *   MMR_o = maintenance margin of all OTHER positions in the cross account
 *   MMF   = maintenance margin fraction for THIS market
 *
 * When there is only one position, pass otherPositionsMMR = 0.
 * The receipt preview always passes 0 (conservative single-position estimate).
 *
 * Example (LONG 0.5 ETH at $3000, equity $1000, MMF 0.03, no other positions):
 *   s = 0.5, p = 3000, e = 1000, MMR_o = 0
 *   p' = (1000 − 0.5×3000 − 0) / (0.5×0.03 − 0.5) = (1000−1500)/( 0.015−0.5) = −500/−0.485 ≈ $1,031
 */
export const calculateCrossLiquidationPrice = (
  size: number,
  price: number,
  equity: number,
  maintenanceMarginFraction: number,
  otherPositionsMMR: number,
  side: 'BUY' | 'SELL'
): number => {

  const s = side === 'BUY' ? size : -size;
  const denominator = size * maintenanceMarginFraction - s;

  if (Math.abs(denominator) < 1e-12) return 0;

  const liqPrice = (equity - s * price - otherPositionsMMR) / denominator;
  return Math.max(0, liqPrice);
};

/**
 * Maximum order size given available balance, price, and leverage.
 * maxNotional = availableBalance × leverage
 * maxSize     = maxNotional / price
 */
export const calculateMaxOrderSize = (
  availableBalance: number,
  price: number,
  leverage: number = 10
): number => {
  if (price <= 0) return 0;
  const maxNotional = availableBalance * leverage;
  return maxNotional / price;
};


export const getLiquidationRiskLevel = (
  marginUsage: number
): 'low' | 'medium' | 'high' | 'critical' => {
  if (marginUsage < 50) return 'low';
  if (marginUsage < 70) return 'medium';
  if (marginUsage < 85) return 'high';
  return 'critical';
};


export const getMarginUsageColors = (usage: number) => {
  if (usage >= 85) {
    return { text: 'text-red-500', bg: 'bg-red-500', border: 'border-red-500' };
  }
  if (usage >= 70) {
    return { text: 'text-orange-500', bg: 'bg-orange-500', border: 'border-orange-500' };
  }
  if (usage >= 50) {
    return { text: 'text-yellow-500', bg: 'bg-yellow-500', border: 'border-yellow-500' };
  }
  return { text: 'text-green-500', bg: 'bg-green-500', border: 'border-green-500' };
};

export const formatCurrency = (value: number, decimals: number = 2): string => {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

export const formatPercent = (value: number, decimals: number = 2): string => {
  return value.toFixed(decimals);
};

/**
 * Minimum margin required to hold a position safely.
 * Adds a safety buffer on top of the maintenance margin requirement.
 * Default buffer 1.10 = 10% above MMR so the UI warns before liquidation.
 */
export const getMinimumRequiredMargin = (
  notionalValue: number,
  maintenanceMarginFraction: number,
  safetyBuffer: number = 1.10
): number => {
  return notionalValue * maintenanceMarginFraction * safetyBuffer;
};

/**
 * Maximum amount transferable out of a subaccount without triggering liquidation.
 * transferable = equity − minimumRequiredMargin
 */
export const getTransferableAmount = (
  equity: number,
  minRequiredMargin: number
): number => {
  return Math.max(0, equity - minRequiredMargin);
};