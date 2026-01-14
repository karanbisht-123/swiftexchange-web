import type { MarketData } from '../types/trading.types';

export type CurrencyMode = 'USD' | 'BASE';

export interface ConversionResult {
  usdAmount: number;
  baseAmount: number;
  isValid: boolean;
}

class CurrencyConversionService {
  convertToBase(usdAmount: number, price: number): number {
    if (price <= 0) return 0;
    return usdAmount / price;
  }

  convertToUsd(baseAmount: number, price: number): number {
    return baseAmount * price;
  }

  roundToStepSize(value: number, stepSize: string): number {
    const step = parseFloat(stepSize);
    if (step <= 0) return value;
    return Math.floor(value / step) * step;
  }

  roundToTickSize(value: number, tickSize: string): number {
    const tick = parseFloat(tickSize);
    if (tick <= 0) return value;
    return Math.round(value / tick) * tick;
  }

  parseInput(input: string, mode: CurrencyMode, marketData: MarketData): ConversionResult {
    const value = parseFloat(input);
    const price = parseFloat(marketData.oraclePrice);

    if (isNaN(value) || value <= 0 || isNaN(price) || price <= 0) {
      return { usdAmount: 0, baseAmount: 0, isValid: false };
    }

    if (mode === 'USD') {
      const baseAmount = this.convertToBase(value, price);
      return {
        usdAmount: value,
        baseAmount,
        isValid: true,
      };
    } else {
      const usdAmount = this.convertToUsd(value, price);
      return {
        usdAmount,
        baseAmount: value,
        isValid: true,
      };
    }
  }

  formatBaseAmount(amount: number, decimals: number = 8): string {
    return amount.toFixed(decimals).replace(/\.?0+$/, '');
  }

  formatUsdAmount(amount: number): string {
    return amount.toFixed(2);
  }

  getStepSizeDecimals(stepSize: string): number {
    const parts = stepSize.split('.');
    return parts.length > 1 ? parts[1].length : 0;
  }

  getMinimumUsd(marketData: MarketData): number {
    if (!marketData.stepSize) return 0;

    const minSize = parseFloat(marketData.stepSize);
    const price = parseFloat(marketData.oraclePrice);

    return minSize * price;
  }

  getNearestValidSize(
    amount: number,
    mode: CurrencyMode,
    marketData: MarketData
  ): ConversionResult {
    const price = parseFloat(marketData.oraclePrice);

    let baseAmount: number;
    if (mode === 'USD') {
      baseAmount = this.convertToBase(amount, price);
    } else {
      baseAmount = amount;
    }

    if (marketData.stepSize) {
      baseAmount = this.roundToStepSize(baseAmount, marketData.stepSize);
    }

    const usdAmount = this.convertToUsd(baseAmount, price);

    return {
      usdAmount,
      baseAmount,
      isValid: true,
    };
  }
}

export const currencyService = new CurrencyConversionService();
