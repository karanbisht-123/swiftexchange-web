import { ethers } from 'ethers';

export function toPlainString(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return '0';
  const num = typeof val === 'number' ? val : Number.parseFloat(val);
  if (Number.isNaN(num)) return '0';

  const str = String(val);
  if (!str.includes('e') && !str.includes('E')) {
    return str;
  }

  const match = new RegExp(/[eE]([-+]?\d+)/).exec(str);
  if (!match) return str;

  const exp = Math.abs(Number.parseInt(match[1], 10));
  const digits = Math.min(100, Math.max(20, exp));
  try {
    return num
      .toFixed(digits)
      .replace(/(\.\d*?)0+$/, '$1')
      .replace(/\.$/, '');
  } catch {
    return str;
  }
}

function trimTrailingZeros(formatted: string): string {
  if (!formatted.includes('.')) return formatted;
  return formatted.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
}

export function formatAmount(amount: string, decimals: number): string {
  if (!amount) return '0';
  try {
    const plainAmount = toPlainString(amount);
    const parts = plainAmount.split('.');
    const cleanAmount =
      parts.length > 1 ? `${parts[0]}.${parts[1].slice(0, decimals)}` : plainAmount;
    return ethers.parseUnits(cleanAmount, decimals).toString();
  } catch (err) {
    console.warn('[formatAmount] Failed to parse amount:', err);
    return '0';
  }
}

const FALLBACK_GAS_BY_CHAIN: Record<string, string> = {
  '1': '0.005', // Ethereum
  '137': '0.05', // Polygon
  '56': '0.002', // BSC
  '42161': '0.0005', // Arbitrum
  '10': '0.0005', // Optimism
  '8453': '0.0005', // Base
  '43114': '0.02', // Avalanche
  default: '0.005',
};

function getFallbackGasAmount(chainId?: number | string): string {
  // Stellar chain IDs are non-numeric strings ('pubnet', 'testnet')
  if (typeof chainId === 'string' && isNaN(Number(chainId))) return '0.00001';
  const key = String(chainId);
  return FALLBACK_GAS_BY_CHAIN[key] ?? FALLBACK_GAS_BY_CHAIN.default;
}

export function getGasBuffer(
  chainId?: number | string,
  decimals: number = 18,
  networkFee?: number | string | null
): bigint {
  if (networkFee !== undefined && networkFee !== null) {
    try {
      const plainFee = toPlainString(networkFee);
      const [whole, frac = ''] = plainFee.split('.');
      let fracKept = frac.slice(0, decimals);
      if (frac.length > decimals) {
        fracKept = (BigInt(fracKept || '0') + 1n).toString().padStart(fracKept.length, '0');
      }
      const cleanFee = fracKept ? `${whole}.${fracKept}` : whole;

      const feeBN = ethers.parseUnits(cleanFee, decimals);
      if (feeBN > 0n) {
        return (feeBN * 120n) / 100n;
      }
    } catch {
      // fall through to baseline below
    }
  }

  const fallbackAmount = getFallbackGasAmount(chainId);
  return ethers.parseUnits(fallbackAmount, decimals);
}

export interface CalculateMaxAmountParams {
  balance: string | number | undefined | null;
  decimals?: number;
  isNative?: boolean;
  chainId: number | string;
  isGasless?: boolean;
  networkFee?: number | string | null;
  actionType?: 'SWAP' | 'BRIDGE';
  feePayType?: 'native' | 'stablecoin';
  bridgeNativeFee?: number | string | null;
}

export function calculateMaxSwapAmount(params: CalculateMaxAmountParams): string {
  const {
    balance,
    decimals = 18,
    isNative = false,
    chainId,
    isGasless = false,
    networkFee,
    actionType = 'SWAP',
    feePayType = 'native',
    bridgeNativeFee,
  } = params;

  if (balance === undefined || balance === null) return '0';

  try {
    const plainBal = toPlainString(balance);
    const parts = plainBal.split('.');
    const cleanBal = parts.length > 1 ? `${parts[0]}.${parts[1].slice(0, decimals)}` : plainBal;
    const balanceBN = ethers.parseUnits(cleanBal, decimals);

    if (balanceBN === 0n) {
      return '0';
    }
    if (!isNative) {
      const formatted = ethers.formatUnits(balanceBN, decimals);
      return trimTrailingZeros(formatted);
    }

    let gasRequiredBN = isGasless ? 0n : getGasBuffer(chainId, decimals, networkFee);

    if (actionType === 'BRIDGE' && feePayType === 'native' && bridgeNativeFee) {
      try {
        const plainBridgeFee = toPlainString(bridgeNativeFee);
        const bridgeFeeBN = ethers.parseUnits(plainBridgeFee, decimals);
        gasRequiredBN += bridgeFeeBN;
      } catch (err) {
        console.warn('[calculateMaxSwapAmount] Failed to parse bridgeNativeFee:', err);
      }
    }

    if (balanceBN <= gasRequiredBN) {
      return '0';
    }

    const maxAmountBN = balanceBN - gasRequiredBN;
    const formatted = ethers.formatUnits(maxAmountBN, decimals);
    return trimTrailingZeros(formatted);
  } catch (err) {
    console.warn('[calculateMaxSwapAmount] Error calculating max amount:', err);
    return isNative ? '0' : toPlainString(balance);
  }
}
