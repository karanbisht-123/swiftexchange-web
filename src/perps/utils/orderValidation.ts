import type { Market, AccountBalance } from '../core/models';
import type { OrderSide, OrderType } from '../core/stores/orderEntryStore';

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

export function validateOrder(
  market: Market | null,
  currentPrice: number, // Need current price for market order notional calculations
  _balances: AccountBalance[],
  _side: OrderSide,
  orderType: OrderType,
  priceStr: string,
  sizeStr: string,
  sizeAsset: 'base' | 'quote', // To know if size is in BTC or USDT
  stopPriceStr?: string,
  callbackRateStr?: string
): ValidationResult {
  if (!market) {
    return { isValid: false, error: 'Market not found' };
  }

  const size = parseFloat(sizeStr);
  const price = parseFloat(priceStr);

  if (isNaN(size) || size <= 0) {
    return { isValid: false, error: 'Enter a valid size' };
  }

  if ((orderType === 'LIMIT' || orderType === 'STOP' || orderType === 'TAKE_PROFIT') && (isNaN(price) || price <= 0)) {
    return { isValid: false, error: 'Enter a valid limit price' };
  }

  if ((orderType === 'STOP' || orderType === 'STOP_MARKET' || orderType === 'TAKE_PROFIT' || orderType === 'TAKE_PROFIT_MARKET') && (!stopPriceStr || isNaN(parseFloat(stopPriceStr)) || parseFloat(stopPriceStr) <= 0)) {
    return { isValid: false, error: 'Enter a valid stop price' };
  }

  if (orderType === 'TRAILING_STOP_MARKET') {
    const rate = parseFloat(callbackRateStr || '0');
    if (isNaN(rate) || rate < 0.1 || rate > 5) {
      return { isValid: false, error: 'Callback rate must be between 0.1% and 5%' };
    }
  }

  // Size Asset Conversion
  let baseAssetSize = size;
  let quoteAssetSize = 0;

  const orderPrice = (orderType === 'LIMIT' || orderType === 'STOP' || orderType === 'TAKE_PROFIT') ? price : currentPrice;

  if (sizeAsset === 'quote') {
    quoteAssetSize = size;
    if (orderPrice > 0) {
      baseAssetSize = size / orderPrice;
    }
  } else {
    baseAssetSize = size;
    if (orderPrice > 0) {
      quoteAssetSize = size * orderPrice;
    }
  }

  // Validations
  if (market.minOrderSize && baseAssetSize < market.minOrderSize) {
    return { isValid: false, error: `Minimum Size is ${market.minOrderSize} ${market.baseAsset}` };
  }

  if (market.minNotional && quoteAssetSize > 0 && quoteAssetSize < market.minNotional) {
    return { isValid: false, error: `Minimum Qty is ${market.minNotional} ${market.quoteAsset}` };
  }

  // Step Size check
  if (market.stepSize && sizeAsset === 'base') {
    const remainder = baseAssetSize % market.stepSize;
    // Account for floating point inaccuracies
    if (remainder > 1e-8 && market.stepSize - remainder > 1e-8) {
      return { isValid: false, error: `Size must be a multiple of ${market.stepSize}` };
    }
  }

  // Tick Size check
  if (market.tickSize && (orderType === 'LIMIT' || orderType === 'STOP' || orderType === 'TAKE_PROFIT')) {
    const remainder = price % market.tickSize;
    if (remainder > 1e-8 && market.tickSize - remainder > 1e-8) {
      return { isValid: false, error: `Price must be a multiple of ${market.tickSize}` };
    }
  }

  // Basic margin check is deferred to ExchangeRightPanel or the exchange engine
  return { isValid: true };
}
