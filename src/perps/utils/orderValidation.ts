import type { AccountBalance, Market } from '../core/models';
import type { OrderSide, OrderType } from '../core/stores/orderEntryStore';

export interface ValidationResult {
  isValid: boolean;
  error?: string;
  errorField?: 'price' | 'size' | 'stopPrice' | 'callbackRate';
}

export function validateOrder(
  market: Market | null,
  currentPrice: number,
  _balances: AccountBalance[],
  _side: OrderSide,
  orderType: OrderType,
  priceStr: string,
  sizeStr: string,
  sizeAsset: 'base' | 'quote',
  stopPriceStr?: string,
  callbackRateStr?: string,
  maxPossibleSize?: number
): ValidationResult {
  if (!market) {
    return { isValid: false };
  }

  const baseAsset = market.baseAsset || 'ASSET';
  const quoteAsset = market.quoteAsset || 'USDT';
  const price = parseFloat(priceStr);
  const size = parseFloat(sizeStr);

  const isPriceRequired =
    orderType === 'LIMIT' ||
    orderType === 'POST_ONLY' ||
    orderType === 'STOP' ||
    orderType === 'TAKE_PROFIT';

  const isStopRequired =
    orderType === 'STOP' ||
    orderType === 'STOP_MARKET' ||
    orderType === 'TAKE_PROFIT' ||
    orderType === 'TAKE_PROFIT_MARKET';

  if (isPriceRequired) {
    if (!priceStr || priceStr.trim() === '') {
      return { isValid: false, errorField: 'price' };
    }
    if (isNaN(price) || price <= 0) {
      return { isValid: false, error: 'Enter a valid price', errorField: 'price' };
    }
    if (market.tickSize && market.tickSize > 0) {
      const precision = Math.max(0, -Math.floor(Math.log10(market.tickSize)));
      const factor = Math.pow(10, Math.min(8, precision + 2));
      const intPrice = Math.round(price * factor);
      const intTick = Math.round(market.tickSize * factor);
      if (intTick > 0 && intPrice % intTick !== 0) {
        return {
          isValid: false,
          error: `Price must be a multiple of ${market.tickSize} ${quoteAsset}`,
          errorField: 'price',
        };
      }
    }
  }

  if (isStopRequired) {
    if (!stopPriceStr || stopPriceStr.trim() === '') {
      return { isValid: false, errorField: 'stopPrice' };
    }
    const stopPrice = parseFloat(stopPriceStr);
    if (isNaN(stopPrice) || stopPrice <= 0) {
      return { isValid: false, error: 'Enter a valid trigger price', errorField: 'stopPrice' };
    }
  }

  if (orderType === 'TRAILING_STOP_MARKET') {
    if (!callbackRateStr || callbackRateStr.trim() === '') {
      return { isValid: false, errorField: 'callbackRate' };
    }
    const rate = parseFloat(callbackRateStr);
    if (isNaN(rate) || rate < 0.1 || rate > 5) {
      return {
        isValid: false,
        error: 'Callback rate must be between 0.1% and 5%',
        errorField: 'callbackRate',
      };
    }
  }

  if (!sizeStr || sizeStr.trim() === '') {
    return { isValid: false };
  }

  if (isNaN(size) || size <= 0) {
    return { isValid: false, error: 'Enter a valid size', errorField: 'size' };
  }

  const effectivePrice = isPriceRequired && price > 0 ? price : currentPrice > 0 ? currentPrice : 1;
  const baseDecimals = market.stepSize ? Math.max(0, -Math.floor(Math.log10(market.stepSize))) : 4;

  if (sizeAsset === 'quote') {
    const quoteSize = size;
    const minNotional = market.minNotional || 0;
    const minQuoteFromLot = (market.minOrderSize || 0) * effectivePrice;
    const minRequiredQuote = Math.max(minNotional, minQuoteFromLot);

    if (minRequiredQuote > 0 && quoteSize < minRequiredQuote) {
      return {
        isValid: false,
        error: `Minimum order size is ${minRequiredQuote.toFixed(2)} ${quoteAsset}`,
        errorField: 'size',
      };
    }

    if (maxPossibleSize && maxPossibleSize > 0 && quoteSize > maxPossibleSize * 1.0001) {
      return {
        isValid: false,
        error: `Exceeds max available size of ${maxPossibleSize.toFixed(2)} ${quoteAsset}`,
        errorField: 'size',
      };
    }
  } else {
    const baseSize = size;
    const minBaseFromLot = market.minOrderSize || 0;
    const minBaseFromNotional =
      market.minNotional && effectivePrice > 0 ? market.minNotional / effectivePrice : 0;
    const minRequiredBase = Math.max(minBaseFromLot, minBaseFromNotional);

    if (minRequiredBase > 0 && baseSize < minRequiredBase) {
      return {
        isValid: false,
        error: `Minimum order size is ${minRequiredBase.toFixed(baseDecimals)} ${baseAsset}`,
        errorField: 'size',
      };
    }

    if (market.stepSize && market.stepSize > 0) {
      const precision = Math.max(0, -Math.floor(Math.log10(market.stepSize)));
      const factor = Math.pow(10, Math.min(8, precision + 2));
      const intBase = Math.round(baseSize * factor);
      const intStep = Math.round(market.stepSize * factor);
      if (intStep > 0 && intBase % intStep !== 0) {
        return {
          isValid: false,
          error: `Size must be a multiple of ${market.stepSize} ${baseAsset}`,
          errorField: 'size',
        };
      }
    }

    if (maxPossibleSize && maxPossibleSize > 0 && baseSize > maxPossibleSize * 1.0001) {
      return {
        isValid: false,
        error: `Exceeds max available size of ${maxPossibleSize.toFixed(baseDecimals)} ${baseAsset}`,
        errorField: 'size',
      };
    }
  }

  return { isValid: true };
}
