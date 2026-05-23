import { type MarginMode, type MarketData, SUBACCOUNT_CONSTANTS } from '../types/trading.types';
import { type CurrencyMode, currencyService } from './currencyService';

export interface OrderValidationResult {
  isValid: boolean;
  error?: string;
  warning?: string;
}

const TRADING_CONSTRAINTS = {
  MIN_CONDITIONAL_ORDER_EQUITY: 20,
  MIN_TRADING_EQUITY: 1,
  MIN_ISOLATED_MARGIN_EQUITY: SUBACCOUNT_CONSTANTS.MIN_ISOLATED_EQUITY,
  SAFETY_MARGIN_MULTIPLIER: 1.02,
  PRECISION_TOLERANCE: 0.0000001,
} as const;

const CONDITIONAL_ORDER_TYPES = [
  'LIMIT',
  'STOP_LIMIT',
  'STOP_MARKET',
  'TAKE_PROFIT_LIMIT',
  'TAKE_PROFIT_MARKET',
] as const;

export function validateOrderSize(
  marketData: MarketData | null,
  inputValue: string,
  mode: CurrencyMode,
  balance?: any | null,
  leverage: number = 1,
  orderType?: string,
  marginMode?: MarginMode
): OrderValidationResult {
  if (!marketData) {
    return createError('Market data not available');
  }
  const conversion = currencyService.parseInput(inputValue, mode, marketData);
  if (!conversion.isValid) {
    return createError('Please enter a valid order size');
  }
  const { baseAmount, usdAmount } = conversion;

  if (marginMode === 'ISOLATED' && orderType && orderType !== 'MARKET') {
    const requiredMargin = usdAmount / leverage;
    if (requiredMargin < 20) {
      const minRequiredUsd = 20 * leverage;
      if (mode === 'USD') {
        return createError(
          `Minimum ISOLATED margin is $20. At ${leverage}x leverage, minimum order size is $${minRequiredUsd.toFixed(2)}`
        );
      } else {
        const minBase = minRequiredUsd / parseFloat(marketData.oraclePrice || '1');
        return createError(
          `Minimum ISOLATED margin is $20. At ${leverage}x leverage, minimum order size is ${minBase.toFixed(getPriceDecimals(marketData.stepSize || '0.0001'))} ${marketData.baseAsset} (~$${minRequiredUsd.toFixed(2)})`
        );
      }
    }
  }

  const minSizeValidation = validateMinimumSize(marketData, baseAmount);
  if (!minSizeValidation.isValid) {
    return minSizeValidation;
  }
  if (balance) {
    const balanceValidation = validateAccountBalance(
      balance,
      usdAmount,
      leverage,
      marketData,
      orderType
    );
    if (!balanceValidation.isValid) {
      return balanceValidation;
    }
  }

  return { isValid: true };
}

function validateMinimumSize(marketData: MarketData, baseAmount: number): OrderValidationResult {
  if (!marketData.stepSize) {
    return { isValid: true };
  }

  const minSize =
    typeof marketData.stepSize === 'string' ? parseFloat(marketData.stepSize) : marketData.stepSize;
  const minUsd = currencyService.getMinimumUsd(marketData);

  if (baseAmount < minSize) {
    return createError(
      `Minimum order size is ${minUsd.toFixed(2)} (${minSize} ${marketData.baseAsset})`
    );
  }

  return { isValid: true };
}

function validateAccountBalance(
  balance: any,
  usdAmount: number,
  leverage: number,
  marketData: MarketData,
  orderType?: string
): OrderValidationResult {
  const equity = parseFloat(balance.totalEquity || '0');
  const freeCollateral = parseFloat(balance.freeCollateral || '0');
  if (equity < TRADING_CONSTRAINTS.MIN_TRADING_EQUITY) {
    return createError(
      `Minimum account equity of $${TRADING_CONSTRAINTS.MIN_TRADING_EQUITY} required for trading`
    );
  }
  if (
    orderType &&
    CONDITIONAL_ORDER_TYPES.includes(orderType as any) &&
    equity < TRADING_CONSTRAINTS.MIN_CONDITIONAL_ORDER_EQUITY
  ) {
    return createError(
      `Conditional orders require minimum account equity of $${TRADING_CONSTRAINTS.MIN_CONDITIONAL_ORDER_EQUITY}`
    );
  }

  if (freeCollateral <= 0) {
    return createError('Insufficient free collateral. Please close positions or add funds.');
  }

  const initialMarginFraction =
    typeof marketData.initialMarginFraction === 'string'
      ? parseFloat(marketData.initialMarginFraction)
      : marketData.initialMarginFraction || 0.05;
  const maxOrderSize = calculateMaxOrderSize(freeCollateral, leverage, initialMarginFraction);

  if (usdAmount > maxOrderSize) {
    return createError(
      `Maximum order size is $${maxOrderSize.toFixed(2)} with ${leverage}x leverage`
    );
  }
  const requiredMargin = usdAmount * initialMarginFraction;
  const safeRequiredMargin = requiredMargin * TRADING_CONSTRAINTS.SAFETY_MARGIN_MULTIPLIER;

  if (safeRequiredMargin > freeCollateral) {
    return createError(
      `Insufficient collateral. Need ~$${safeRequiredMargin.toFixed(2)}, have $${freeCollateral.toFixed(2)}`
    );
  }

  if (requiredMargin > freeCollateral * 0.9) {
    return {
      isValid: true,
      warning: `Warning: This order uses >90% of available collateral. High leverage orders near the limit often fail the on-chain collateral check. Consider reducing size or leverage.`,
    };
  }

  if (requiredMargin > freeCollateral * 0.8) {
    return {
      isValid: true,
      warning: 'Using >80% of free collateral. Higher leverage increases the risk of on-chain rejection.',
    };
  }

  return { isValid: true };
}

function calculateMaxOrderSize(
  freeCollateral: number,
  leverage: number,
  initialMarginFraction: number
): number {
  const maxLeverage = 1 / initialMarginFraction;
  const effectiveLeverage = Math.min(leverage, maxLeverage);
  return freeCollateral * effectiveLeverage;
}

export function validateOrderPrice(
  marketData: MarketData | null,
  price: string
): OrderValidationResult {
  if (!marketData) {
    return createError('Market data not available');
  }

  const priceValue = parseFloat(price);
  if (isNaN(priceValue) || priceValue <= 0) {
    return createError('Please enter a valid price greater than 0');
  }
  if (marketData.oraclePrice) {
    const oraclePrice = parseFloat(marketData.oraclePrice);
    const deviation = Math.abs(priceValue - oraclePrice) / oraclePrice;

    if (deviation > 0.1) {
      return {
        isValid: true,
        warning: `Price is ${(deviation * 100).toFixed(1)}% away from current market price`,
      };
    }
  }

  return { isValid: true };
}

export function validateTriggerPrice(
  marketData: MarketData | null,
  triggerPrice: string,
  orderSide: 'BUY' | 'SELL',
  orderType: string
): OrderValidationResult {
  const priceValidation = validateOrderPrice(marketData, triggerPrice);
  if (!priceValidation.isValid) {
    return priceValidation;
  }
  if (marketData?.oraclePrice) {
    const currentPrice = parseFloat(marketData.oraclePrice);
    const trigger = parseFloat(triggerPrice);

    const isStopOrder = orderType.includes('STOP');
    const isTakeProfitOrder = orderType.includes('TAKE_PROFIT');
    if (isStopOrder) {
      if (orderSide === 'SELL' && trigger >= currentPrice) {
        return {
          isValid: true,
          warning: 'Stop loss trigger is above current price (may execute immediately)',
        };
      }
      if (orderSide === 'BUY' && trigger <= currentPrice) {
        return {
          isValid: true,
          warning: 'Stop loss trigger is below current price (may execute immediately)',
        };
      }
    }

    if (isTakeProfitOrder) {
      if (orderSide === 'SELL' && trigger <= currentPrice) {
        return {
          isValid: true,
          warning: 'Take profit trigger is below current price (may execute immediately)',
        };
      }
      if (orderSide === 'BUY' && trigger >= currentPrice) {
        return {
          isValid: true,
          warning: 'Take profit trigger is above current price (may execute immediately)',
        };
      }
    }
  }

  return { isValid: true };
}

export function getMaxBuyingPower(
  balance: any | null,
  marketData: MarketData | null,
  leverage: number = 1
): number {
  if (!balance || !marketData) {
    return 0;
  }

  const freeCollateral = parseFloat(balance.freeCollateral || '0');
  if (freeCollateral <= 0) {
    return 0;
  }

  const initialMarginFraction =
    typeof marketData.initialMarginFraction === 'string'
      ? parseFloat(marketData.initialMarginFraction)
      : marketData.initialMarginFraction || 0.05;
  return calculateMaxOrderSize(freeCollateral, leverage, initialMarginFraction);
}

export function getSafeMaxBuyingPower(
  balance: any | null,
  marketData: MarketData | null,
  leverage: number = 1
): number {
  const raw = getMaxBuyingPower(balance, marketData, leverage);
  return raw / TRADING_CONSTRAINTS.SAFETY_MARGIN_MULTIPLIER;
}

function createError(message: string): OrderValidationResult {
  return {
    isValid: false,
    error: message,
  };
}
export function roundToTickSize(price: number, tickSize: number): number {
  return Math.round(price / tickSize) * tickSize;
}

export function getPriceDecimals(tickSize: string | number): number {
  const tickStr = typeof tickSize === 'number' ? tickSize.toString() : tickSize;
  const parts = tickStr.split('.');
  return parts.length > 1 ? parts[1].length : 0;
}

export function validateIsolatedPosition(
  marginMode: MarginMode,
  subaccountEquity: number,
  orderType?: string
): OrderValidationResult {
  if (marginMode !== 'ISOLATED') {
    return { isValid: true };
  }

  if (subaccountEquity < TRADING_CONSTRAINTS.MIN_ISOLATED_MARGIN_EQUITY) {
    const difference = TRADING_CONSTRAINTS.MIN_ISOLATED_MARGIN_EQUITY - subaccountEquity;
    return createError(
      `Isolated positions require minimum $${TRADING_CONSTRAINTS.MIN_ISOLATED_MARGIN_EQUITY} equity. ` +
      `Need $${difference.toFixed(2)} more. Transfer funds to this subaccount first.`
    );
  }

  if (
    orderType &&
    CONDITIONAL_ORDER_TYPES.includes(orderType as any) &&
    subaccountEquity < TRADING_CONSTRAINTS.MIN_CONDITIONAL_ORDER_EQUITY
  ) {
    return createError(
      `Conditional orders require minimum $${TRADING_CONSTRAINTS.MIN_CONDITIONAL_ORDER_EQUITY} equity in isolated subaccount`
    );
  }

  return { isValid: true };
}

export function calculateIsolatedCollateralRequired(
  orderSizeUsd: number,
  initialMarginFraction: number
): number {
  const marginRequired = orderSizeUsd * initialMarginFraction;
  const withBuffer = marginRequired * TRADING_CONSTRAINTS.SAFETY_MARGIN_MULTIPLIER;
  return Math.max(withBuffer, TRADING_CONSTRAINTS.MIN_ISOLATED_MARGIN_EQUITY);
}

export function calculateLiquidationPrice(
  size: number,
  price: number,
  equity: number,
  mmf: number,
  side: 'BUY' | 'SELL'
): number {
  const s = side === 'BUY' ? size : -size;
  const denominator = size * mmf - s;

  if (Math.abs(denominator) < 1e-12) return 0;

  const liqPrice = (equity - s * price) / denominator;
  return Math.max(0, liqPrice);
}
