export interface AccountBalance {
  equity: string;
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
 * Equity = Q + Σ(Si × Pi)  →  provided by dYdX as `equity`
 * Free Collateral = Equity − Total Initial Margin Requirement
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

  const equity = parseFloat(balance.equity || '0');
  const freeCollateral = parseFloat(balance.freeCollateral || '0');
  const totalMarginRequired = equity - freeCollateral;

  let marginUsagePercent = 0;
  if (equity > 0) {
    marginUsagePercent = (totalMarginRequired / equity) * 100;
  }

  return {
    portfolioValue: equity,
    availableBalance: freeCollateral,
    marginUsed: totalMarginRequired,
    marginUsagePercent: Math.max(0, Math.min(100, marginUsagePercent)),
    totalMarginRequired,
  };
};

/**
 * Calculate the Initial Margin Requirement for a single position.
 * IMR = |S × P × I|
 * S = size, P = price, I = initialMarginFraction
 */
export const calculateInitialMarginRequired = (
  size: number,
  price: number,
  initialMarginFraction: number
): number => {
  return Math.abs(size * price * initialMarginFraction);
};

/**
 * Calculate the Maintenance Margin Requirement for a single position.
 * MMR = |S × P × M|
 */
export const calculateMaintenanceMarginRequired = (
  size: number,
  price: number,
  maintenanceMarginFraction: number
): number => {
  return Math.abs(size * price * maintenanceMarginFraction);
};

/**
 * Calculate post-order margin impact for the receipt display.
 * Uses IMF-based formula: IMR = |size × price × imf|
 */
export const calculateOrderMarginImpact = (
  currentEquity: number,
  currentFree: number,
  orderSize: number,
  orderPrice: number,
  leverage: number = 10,
  initialMarginFraction: number = 0.05
): OrderMarginImpact => {
  const notionalValue = Math.abs(orderSize * orderPrice);
  const initialMarginRequired = Math.abs(orderSize * orderPrice * initialMarginFraction);
  const maintenanceMarginRequired = initialMarginRequired * 0.6;

  const newAvailableBalance = currentFree - initialMarginRequired;
  const newMarginUsed = currentEquity - newAvailableBalance;

  let newMarginUsage = 0;
  if (currentEquity > 0) {
    newMarginUsage = (newMarginUsed / currentEquity) * 100;
  }

  return {
    initialMarginRequired,
    maintenanceMarginRequired,
    newAvailableBalance: Math.max(0, newAvailableBalance),
    newMarginUsage: Math.max(0, Math.min(100, newMarginUsage)),
    newMarginUsed: Math.max(0, newMarginUsed),
    notionalValue,
    canAfford: newAvailableBalance >= 0,
    leverage,
  };
};

/**
 * Calculate liquidation price for an ISOLATED position.
 * p' = (e − s × p) / (|s| × MMF − s)
 * e = subaccount equity, s = signed size, p = entry price
 */
export const calculateIsolatedLiquidationPrice = (
  size: number,
  price: number,
  equity: number,
  maintenanceMarginFraction: number,
  side: 'BUY' | 'SELL'
): number => {
  const s = side === 'BUY' ? size : -size;
  const numerator = equity - s * price;
  const denominator = Math.abs(s) * maintenanceMarginFraction - s;
  if (denominator === 0) return 0;
  return Math.max(0, numerator / denominator);
};

/**
 * Calculate liquidation price for a CROSS position.
 * p' = (e − s × p − MMR_o) / (|s| × MMF − s)
 * MMR_o = maintenance margin of all OTHER positions in the subaccount
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
  const numerator = equity - s * price - otherPositionsMMR;
  const denominator = Math.abs(s) * maintenanceMarginFraction - s;
  if (denominator === 0) return 0;
  return Math.max(0, numerator / denominator);
};

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
    return {
      text: 'text-red-500',
      bg: 'bg-red-500',
      border: 'border-red-500',
    };
  }
  if (usage >= 70) {
    return {
      text: 'text-orange-500',
      bg: 'bg-orange-500',
      border: 'border-orange-500',
    };
  }
  if (usage >= 50) {
    return {
      text: 'text-yellow-500',
      bg: 'bg-yellow-500',
      border: 'border-yellow-500',
    };
  }
  return {
    text: 'text-green-500',
    bg: 'bg-green-500',
    border: 'border-green-500',
  };
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
