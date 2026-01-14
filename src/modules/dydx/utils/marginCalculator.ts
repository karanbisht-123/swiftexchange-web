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
  marginRequired: number;
  newAvailableBalance: number;
  newMarginUsage: number;
  newMarginUsed: number;
  notionalValue: number;
  canAfford: boolean;
  leverage: number;
}

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
  const marginUsed = equity - freeCollateral;

  let marginUsagePercent = 0;
  if (equity > 0) {
    marginUsagePercent = (marginUsed / equity) * 100;
  }

  return {
    portfolioValue: equity,
    availableBalance: freeCollateral,
    marginUsed,
    marginUsagePercent: Math.max(0, Math.min(100, marginUsagePercent)),
    totalMarginRequired: marginUsed,
  };
};

export const calculateOrderMarginImpact = (
  currentEquity: number,
  currentFree: number,
  orderSize: number,
  orderPrice: number,
  leverage: number = 10
): OrderMarginImpact => {
  const notionalValue = Math.abs(orderSize * orderPrice);
  const marginRequired = notionalValue / leverage;
  const newAvailableBalance = currentFree - marginRequired;
  const newMarginUsed = currentEquity - newAvailableBalance;

  let newMarginUsage = 0;
  if (currentEquity > 0) {
    newMarginUsage = (newMarginUsed / currentEquity) * 100;
  }

  return {
    marginRequired,
    newAvailableBalance: Math.max(0, newAvailableBalance),
    newMarginUsage: Math.max(0, Math.min(100, newMarginUsage)),
    newMarginUsed: Math.max(0, newMarginUsed),
    notionalValue,
    canAfford: newAvailableBalance >= 0,
    leverage,
  };
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
