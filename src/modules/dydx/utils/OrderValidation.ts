import type { MarketData } from '../hooks/useMarkets';
import { type CurrencyMode, currencyService } from './currencyService';

/**
 * Result of an order validation check
 */
export interface OrderValidationResult {
  isValid: boolean;
  error?: string;
  warning?: string;
}

/**
 * Trading constraints and minimum requirements
 */
const TRADING_CONSTRAINTS = {
  // Minimum account equity required for conditional orders (USD)
  MIN_CONDITIONAL_ORDER_EQUITY: 20,

  // Minimum account equity required for any trading (USD)
  MIN_TRADING_EQUITY: 1,

  // Safety margin multiplier for collateral checks
  SAFETY_MARGIN_MULTIPLIER: 1.1,

  // Precision tolerance for floating point comparisons
  PRECISION_TOLERANCE: 0.0000001,
} as const;

/**
 * Order types that require conditional order minimum equity
 */
const CONDITIONAL_ORDER_TYPES = [
  'LIMIT',
  'STOP_LIMIT',
  'STOP_MARKET',
  'TAKE_PROFIT_LIMIT',
  'TAKE_PROFIT_MARKET',
] as const;

// ============================================================================
// ORDER SIZE VALIDATION
// ============================================================================

/**
 * Validates order size against market constraints and account balance
 * @param marketData - Market information with trading parameters
 * @param inputValue - User input for order size
 * @param mode - Currency mode (USD or BASE asset)
 * @param balance - User's account balance information
 * @param leverage - Selected leverage multiplier
 * @param orderType - Type of order being placed
 * @returns Validation result with error/warning messages
 */
export function validateOrderSize(
  marketData: MarketData | null,
  inputValue: string,
  mode: CurrencyMode,
  balance?: any | null,
  leverage: number = 1,
  orderType?: string
): OrderValidationResult {
  // Check if market data is available
  if (!marketData) {
    return createError('Market data not available');
  }

  // Parse and validate input
  const conversion = currencyService.parseInput(inputValue, mode, marketData);
  if (!conversion.isValid) {
    return createError('Please enter a valid order size');
  }

  const { baseAmount, usdAmount } = conversion;

  // Validate minimum order size
  const minSizeValidation = validateMinimumSize(marketData, baseAmount, usdAmount);
  if (!minSizeValidation.isValid) {
    return minSizeValidation;
  }

  // Validate against account balance if provided
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

/**
 * Validates that order size meets minimum requirements
 */
function validateMinimumSize(
  marketData: MarketData,
  baseAmount: number,
  usdAmount: number
): OrderValidationResult {
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

/**
 * Validates order size against account balance and leverage
 */
function validateAccountBalance(
  balance: any,
  usdAmount: number,
  leverage: number,
  marketData: MarketData,
  orderType?: string
): OrderValidationResult {
  const equity = parseFloat(balance.equity || '0');
  const freeCollateral = parseFloat(balance.freeCollateral || '0');

  // Check minimum equity for trading
  if (equity < TRADING_CONSTRAINTS.MIN_TRADING_EQUITY) {
    return createError(
      `Minimum account equity of $${TRADING_CONSTRAINTS.MIN_TRADING_EQUITY} required for trading`
    );
  }

  // Check minimum equity for conditional orders
  if (
    orderType &&
    CONDITIONAL_ORDER_TYPES.includes(orderType as any) &&
    equity < TRADING_CONSTRAINTS.MIN_CONDITIONAL_ORDER_EQUITY
  ) {
    return createError(
      `Conditional orders require minimum account equity of $${TRADING_CONSTRAINTS.MIN_CONDITIONAL_ORDER_EQUITY}`
    );
  }

  // Check free collateral
  if (freeCollateral <= 0) {
    return createError('Insufficient free collateral. Please close positions or add funds.');
  }

  // Calculate maximum order size
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

  // Calculate required margin with safety buffer
  const requiredMargin = usdAmount * initialMarginFraction;
  const safeRequiredMargin = requiredMargin * TRADING_CONSTRAINTS.SAFETY_MARGIN_MULTIPLIER;

  if (safeRequiredMargin > freeCollateral) {
    return createError(
      `Insufficient collateral. Need ~$${safeRequiredMargin.toFixed(2)}, have $${freeCollateral.toFixed(2)}`
    );
  }

  // Warning if using >80% of free collateral
  if (requiredMargin > freeCollateral * 0.8) {
    return {
      isValid: true,
      warning: 'Using >80% of free collateral. Consider reducing order size.',
    };
  }

  return { isValid: true };
}

/**
 * Calculates maximum order size based on collateral and leverage
 */
function calculateMaxOrderSize(
  freeCollateral: number,
  leverage: number,
  initialMarginFraction: number
): number {
  const maxLeverage = 1 / initialMarginFraction;
  const effectiveLeverage = Math.min(leverage, maxLeverage);
  return freeCollateral * effectiveLeverage;
}

// ============================================================================
// PRICE VALIDATION
// ============================================================================

/**
 * Validates order price against market tick size
 * @param marketData - Market information
 * @param price - Order price to validate
 * @returns Validation result
 */
export function validateOrderPrice(
  marketData: MarketData | null,
  price: string
): OrderValidationResult {
  if (!marketData) {
    return createError('Market data not available');
  }

  const priceValue = parseFloat(price);

  // Check if price is a valid positive number
  if (isNaN(priceValue) || priceValue <= 0) {
    return createError('Please enter a valid price greater than 0');
  }

  // Validate tick size compliance
  if (marketData.tickSize) {
    const tickSize =
      typeof marketData.tickSize === 'string'
        ? parseFloat(marketData.tickSize)
        : marketData.tickSize;
    const remainder = priceValue % tickSize;

    // Use tolerance for floating point comparison
    const isValidTickSize =
      remainder < TRADING_CONSTRAINTS.PRECISION_TOLERANCE ||
      tickSize - remainder < TRADING_CONSTRAINTS.PRECISION_TOLERANCE;

    if (!isValidTickSize) {
      return createError(
        `Price must be a multiple of ${marketData.tickSize}. Nearest valid: ${roundToTickSize(priceValue, tickSize).toFixed(getPriceDecimals(marketData.tickSize))}`
      );
    }
  }

  // Warning for prices far from current oracle price
  if (marketData.oraclePrice) {
    const oraclePrice = parseFloat(marketData.oraclePrice);
    const deviation = Math.abs(priceValue - oraclePrice) / oraclePrice;

    if (deviation > 0.1) {
      // >10% deviation
      return {
        isValid: true,
        warning: `Price is ${(deviation * 100).toFixed(1)}% away from current market price`,
      };
    }
  }

  return { isValid: true };
}

/**
 * Validates trigger price for conditional orders
 * @param marketData - Market information
 * @param triggerPrice - Trigger price to validate
 * @param orderSide - BUY or SELL
 * @param orderType - Type of conditional order
 * @returns Validation result
 */
export function validateTriggerPrice(
  marketData: MarketData | null,
  triggerPrice: string,
  orderSide: 'BUY' | 'SELL',
  orderType: string
): OrderValidationResult {
  // First validate as a regular price
  const priceValidation = validateOrderPrice(marketData, triggerPrice);
  if (!priceValidation.isValid) {
    return priceValidation;
  }

  // Additional validation for trigger logic
  if (marketData?.oraclePrice) {
    const currentPrice = parseFloat(marketData.oraclePrice);
    const trigger = parseFloat(triggerPrice);

    const isStopOrder = orderType.includes('STOP');
    const isTakeProfitOrder = orderType.includes('TAKE_PROFIT');

    // Stop Loss validation
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

    // Take Profit validation
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

// ============================================================================
// BUYING POWER CALCULATION
// ============================================================================

/**
 * Calculates maximum buying power based on account balance and leverage
 * @param balance - Account balance information
 * @param marketData - Market information
 * @param leverage - Selected leverage
 * @returns Maximum order size in USD
 */
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

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Creates an error validation result
 */
function createError(message: string): OrderValidationResult {
  return {
    isValid: false,
    error: message,
  };
}

/**
 * Rounds a price to the nearest tick size
 */
function roundToTickSize(price: number, tickSize: number): number {
  return Math.round(price / tickSize) * tickSize;
}

/**
 * Gets the number of decimal places for a tick size
 */
function getPriceDecimals(tickSize: string | number): number {
  const tickStr = typeof tickSize === 'number' ? tickSize.toString() : tickSize;
  const parts = tickStr.split('.');
  return parts.length > 1 ? parts[1].length : 0;
}
