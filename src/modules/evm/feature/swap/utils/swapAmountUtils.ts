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
  return num.toFixed(Math.max(20, exp)).replace(/\.?0+$/, '');
}

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

export function getGasBuffer(chainId: number | string, decimals: number): bigint {
  const id = String(chainId);
  let bufferStr = '0.003';

  if (id === '56') {
    bufferStr = '0.0005'; // BSC (BNB)
  } else if (id === '137') {
    bufferStr = '0.1'; // Polygon (POL/MATIC)
  } else if (id === '42161' || id === '10' || id === '8453') {
    bufferStr = '0.0005'; // L2s (Arbitrum, Optimism, Base - ETH)
  } else if (id === 'stellar' || id === 'pubnet' || id === 'testnet') {
    bufferStr = '0.01'; // Stellar (XLM)
  }

  return ethers.parseUnits(bufferStr, decimals);
}
