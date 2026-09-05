import { type TransactionItem } from '../service/EvmTransactionService';

export const formatTxAmount = (
  tx: Pick<TransactionItem, 'formattedAmount' | 'value' | 'rawContract' | 'category'>
): string => {
  if (tx.category === 'erc721' || tx.category === 'erc1155') {
    return '—';
  }

  const fromFormatted = tx.formattedAmount != null ? parseFloat(tx.formattedAmount) : NaN;

  if (!isNaN(fromFormatted) && fromFormatted > 0) {
    if (fromFormatted < 0.000001) return '< 0.000001';
    if (fromFormatted < 0.0001) return fromFormatted.toFixed(6).replace(/0+$/, '');
    return fromFormatted.toFixed(6);
  }

  if (tx.rawContract?.value && tx.rawContract?.decimal) {
    try {
      const raw = BigInt(tx.rawContract.value);
      const decimals = parseInt(tx.rawContract.decimal, 10);
      if (!isNaN(decimals) && decimals >= 0) {
        const divisor = BigInt(10) ** BigInt(decimals);
        const whole = raw / divisor;
        const remainder = raw % divisor;
        const fracStr = remainder.toString().padStart(decimals, '0').slice(0, 10);
        const result = parseFloat(`${whole}.${fracStr}`);
        if (result === 0) return '< 0.000001';
        if (result < 0.000001) return '< 0.000001';
        return result.toFixed(6).replace(/\.?0+$/, '') || '0';
      }
    } catch {
      // Fall through to tx.value parsing if rawContract BigInt parsing fails
    }
  }

  if (tx.value != null && !isNaN(Number(tx.value)) && Number(tx.value) > 0) {
    const v = Number(tx.value);
    if (v < 0.000001) return '< 0.000001';
    return v.toFixed(8).replace(/\.?0+$/, '');
  }

  return '—';
};

export const formatAssetName = (
  tx: Pick<TransactionItem, 'asset' | 'category' | 'rawContract'>
): string => {
  if (tx.asset) return tx.asset;
  if (tx.category === 'erc721') return 'Asset';
  if (tx.category === 'erc1155') return 'Asset';
  return '—';
};

export const getDisplayAmountWithSign = (
  formattedAmount: string,
  isIncoming: boolean,
  isSelf: boolean
): string => {
  if (formattedAmount === '—') return '—';
  if (isSelf) return formattedAmount;

  const sign = isIncoming ? '+' : '-';

  if (formattedAmount.startsWith('<')) {
    return `${sign} < 0.000001`;
  }

  return `${sign}${formattedAmount}`;
};
