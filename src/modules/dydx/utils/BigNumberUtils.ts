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
    console.error('[BigNumberUtils] Error:', error);
    return '—';
  }
};

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

    const formatted = bn.toFormat(decimals, BigNumber.ROUND_HALF_UP);
    return `${prefix}${formatted}${suffix}`;
  } catch (error) {
    console.error('[BigNumberUtils] Error:', error);
    return '—';
  }
};

export const formatPriceByTickSize = (
  value: string | number | null | undefined,
  tickSize: string | number | null | undefined,
  prefix: string = '$'
): string => {
  if (value === null || value === undefined || value === '') return '—';

  try {
    const bnValue = new BigNumber(value);
    if (bnValue.isNaN()) return '—';

    let decimals = 2;
    if (tickSize !== null && tickSize !== undefined && tickSize !== '') {
      const bnTick = new BigNumber(tickSize);
      if (!bnTick.isNaN()) {
        decimals = bnTick.decimalPlaces() || 0;
      }
    }

    return bnValue.toFormat(decimals, BigNumber.ROUND_HALF_UP, {
      ...BigNumber.config().FORMAT,
      prefix,
    });
  } catch (error) {
    console.error('[BigNumberUtils] Error:', error);
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
    else if (num >= 0.0001) decimals = 8;
    else decimals = 20;

    const rounded = bn.decimalPlaces(decimals, BigNumber.ROUND_HALF_UP);
    const formatted = rounded.toFormat();

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
    console.error('[BigNumberUtils] Error:', error);
    return '—';
  }
};
