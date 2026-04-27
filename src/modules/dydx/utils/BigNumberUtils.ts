import BigNumber from 'bignumber.js';


BigNumber.config({
  DECIMAL_PLACES: 20,
  ROUNDING_MODE: BigNumber.ROUND_HALF_UP,
  FORMAT: {
    decimalSeparator: '.',
    groupSeparator: ',',
    groupSize: 3,
    secondaryGroupSize: 0,
    fractionGroupSeparator: ' ',
    fractionGroupSize: 0,
  },
});

/**
 * Formats a numeric value with standard rounding logic (ROUND_HALF_UP).
 * 
 * @param value The value to format (number or string)
 * @param decimals Number of decimal places
 * @param prefix Optional prefix (e.g., "$")
 * @param suffix Optional suffix (e.g., " USD")
 * @returns Formatted string or "—" if invalid
 */
export const formatNumeric = (
  value: string | number | null | undefined,
  decimals: number = 2,
  prefix: string = '',
  suffix: string = ''
): string => {
  if (value === null || value === undefined || value === '') return '—';

  try {
    const bn = new BigNumber(value);
    if (bn.isNaN()) return '—';

    const formatted = bn.toFixed(decimals, BigNumber.ROUND_HALF_UP);
    return `${prefix}${formatted}${suffix}`;
  } catch (error) {
    console.error('[BigNumberUtils] Error formatting value:', error);
    return '—';
  }
};

/**
 * Formats a numeric value with standard rounding logic and locale-based commas.
 * 
 * @param value The value to format (number or string)
 * @param decimals Number of decimal places
 * @param prefix Optional prefix (e.g., "$")
 * @param suffix Optional suffix (e.g., " USD")
 * @returns Formatted string or "—" if invalid
 */
export const formatNumericWithCommas = (
  value: string | number | null | undefined,
  decimals: number = 2,
  prefix: string = '',
  suffix: string = ''
): string => {
  if (value === null || value === undefined || value === '') return '—';

  try {
    const bn = new BigNumber(value);
    if (bn.isNaN()) return '—';

    // Using toFormat for comma separation with ROUND_HALF_UP
    const formatted = bn.toFormat(decimals, BigNumber.ROUND_HALF_UP);
    return `${prefix}${formatted}${suffix}`;
  } catch (error) {
    console.error('[BigNumberUtils] Error formatting value with commas:', error);
    return '—';
  }
};

/**
 * Formats a price value with precision derived from the market's tick size.
 * 
 * @param value The price value to format
 * @param tickSize The market's tick size (e.g., "0.01", "1")
 * @param prefix Optional prefix (default: "$")
 * @returns Formatted string
 */
export const formatPriceByTickSize = (
  value: string | number | null | undefined,
  tickSize: string | number | null | undefined,
  prefix: string = '$'
): string => {
  if (value === null || value === undefined || value === '') return '—';
  
  try {
    const bnValue = new BigNumber(value);
    if (bnValue.isNaN()) return '—';

    // Default to 2 decimals if tickSize is missing
    let decimals = 2;
    if (tickSize !== null && tickSize !== undefined && tickSize !== '') {
      const bnTick = new BigNumber(tickSize);
      if (!bnTick.isNaN()) {
        decimals = bnTick.decimalPlaces() || 0;
      }
    }

    return bnValue.toFormat(decimals, BigNumber.ROUND_HALF_UP, {
      prefix,
    });
  } catch (error) {
    console.error('[BigNumberUtils] Error formatting price by tick size:', error);
    return '—';
  }
};

const toSubscript = (num: number): string => {
  const subscripts = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'];
  return num
    .toString()
    .split('')
    .map(d => subscripts[parseInt(d, 10)])
    .join('');
};

/**
 * Formats a market price dynamically, removing trailing zeroes.
 * E.g., BTC: 71,615 | ETH: 2,251.9 | PEPE: 0.0₅36929
 * 
 * @param value The price value to format
 * @param prefix Optional prefix (default: "")
 * @returns Formatted string
 */
export const formatMarketPrice = (
  value: string | number | null | undefined,
  prefix: string = ''
): string => {
  if (value === null || value === undefined || value === '') return '—';
  
  try {
    const bn = new BigNumber(value);
    if (bn.isNaN()) return '—';

    const num = Math.abs(bn.toNumber());
    
    let decimals = 2;
    if (num >= 10000) decimals = 0;
    else if (num >= 1000) decimals = 1;
    else if (num >= 1) decimals = 4;
    else if (num >= 0.0001) decimals = 7;
    else decimals = 10; // Up to 10 decimal places for micro tokens like PEPE

    const rounded = bn.decimalPlaces(decimals, BigNumber.ROUND_HALF_UP);
    const formatted = rounded.toFormat(); // gets it without trailing zeros but with commas
    
    // Subscript compression for >= 4 consecutive zeros after decimal
    const parts = formatted.split('.');
    if (parts.length === 2 && parts[0] === '0') {
      const fractional = parts[1];
      let zeroCount = 0;
      while (zeroCount < fractional.length && fractional[zeroCount] === '0') {
        zeroCount++;
      }
      
      if (zeroCount >= 4) {
        const remainingArgs = fractional.slice(zeroCount);
        return `${prefix}0.0${toSubscript(zeroCount)}${remainingArgs}`;
      }
    }

    return `${prefix}${formatted}`;
  } catch (error) {
    console.error('[BigNumberUtils] Error formatting market price:', error);
    return '—';
  }
};
