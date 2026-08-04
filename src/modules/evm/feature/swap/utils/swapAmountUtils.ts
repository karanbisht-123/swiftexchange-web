import { ethers } from 'ethers';

//  Converts numbers/strings (including scientific notation like 1e-8) to a plain decimal string.

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
  return num.toFixed(Math.max(20, exp)).replace(/\.?0+$/, '');
}

//Formats a decimal token amount string into smallest base units as a string.

export function formatAmount(amount: string, decimals: number): string {
  if (!amount) return '0';
  try {
    const parts = amount.split('.');
    const cleanAmount = parts.length > 1 ? parts[0] + '.' + parts[1].slice(0, decimals) : amount;
    return ethers.parseUnits(cleanAmount, decimals).toString();
  } catch (err) {
    console.warn('[formatAmount] Fallback to raw:', err);
    return amount;
  }
}

// Returns dynamic gas buffer in token base units (BigInt).
// Uses exact dynamic quote network fee (+20% safety cushion) when available.
// Falls back to a safe minimal baseline (0.0001 ETH/BNB/POL or 0.01 XLM) only before quote loads.

export function getGasBuffer(
  chainId?: number | string,
  decimals: number = 18,
  networkFee?: number | string | null
): bigint {
  // Dynamic calculation: uses live quote network fee with 20% cushion in BigInt
  if (networkFee !== undefined && networkFee !== null) {
    try {
      const plainFee = toPlainString(networkFee);
      const parts = plainFee.split('.');
      const cleanFee = parts.length > 1 ? parts[0] + '.' + parts[1].slice(0, decimals) : plainFee;
      const feeBN = ethers.parseUnits(cleanFee, decimals);
      if (feeBN > 0n) {
        return (feeBN * 120n) / 100n;
      }
    } catch {
      //fallback to baseline below
    }
  }

  // Minimal fallback baseline before quote has arrived
  const isStellarChain =
    chainId !== undefined &&
    (String(chainId).includes('stellar') ||
      String(chainId).includes('pubnet') ||
      String(chainId).includes('testnet'));

  const fallbackAmount = isStellarChain ? '0.01' : '0.0001';
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

/**
 * Production-ready MAX amount calculation using ethers.js:
 * - ERC-20 / Non-native tokens: 100% of balance (gas is paid in native currency).
 * - Gasless / Fusion trades: 100% of token balance.
 * - Native Gas Tokens (ETH, BNB, POL, XLM): Reserves estimated network fee (+20% safety margin).
 *   If balance <= gas needed, returns '0' to avoid setting 100% balance and triggering validation errors.
 */
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
    const cleanBal = parts.length > 1 ? parts[0] + '.' + parts[1].slice(0, decimals) : plainBal;
    const balanceBN = ethers.parseUnits(cleanBal, decimals);

    if (balanceBN === 0n) {
      return '0';
    }

    // For non-native tokens (ERC-20, etc.), 100% of the token balance can be swapped
    if (!isNative) {
      const formatted = ethers.formatUnits(balanceBN, decimals);
      return formatted.replace(/\.?0+$/, '');
    }

    // For native gas tokens: if gasless, network gas is 0n; otherwise compute gas buffer
    let gasRequiredBN = isGasless ? 0n : getGasBuffer(chainId, decimals, networkFee);

    // If bridging and paying bridge fee in native token, add native bridge fee
    if (actionType === 'BRIDGE' && feePayType === 'native' && bridgeNativeFee) {
      try {
        const plainBridgeFee = toPlainString(bridgeNativeFee);
        const bridgeFeeBN = ethers.parseUnits(plainBridgeFee, decimals);
        gasRequiredBN += bridgeFeeBN;
      } catch (err) {
        console.warn('[calculateMaxSwapAmount] Failed to parse bridgeNativeFee:', err);
      }
    }

    // If balance is less than or equal to gas required, return 0 (cannot afford gas)
    if (balanceBN <= gasRequiredBN) {
      return '0';
    }

    const maxAmountBN = balanceBN - gasRequiredBN;
    const formatted = ethers.formatUnits(maxAmountBN, decimals);
    return formatted.replace(/\.?0+$/, '');
  } catch (err) {
    console.warn('[calculateMaxSwapAmount] Error calculating max amount:', err);
    return isNative ? '0' : toPlainString(balance);
  }
}
