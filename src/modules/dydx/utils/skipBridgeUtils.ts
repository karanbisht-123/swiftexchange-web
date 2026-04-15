import { fromBech32, toBech32 } from '@cosmjs/encoding';
import { createWalletClient, custom } from 'viem';
import * as viemChains from 'viem/chains';
import { getTokenAddress, getChainById } from '../../evm/utils/Chainregistry';

export const DYDX_CHAIN_ID = 'dydx-mainnet-1';
export const NOBLE_CHAIN_ID = 'noble-1';

export const DYDX_USDC_DENOM =
  'ibc/8E27BA2D5493AF5636760E354E46004562C46AB7EC0CC4C1CA14E9E20E2545B5';

export const NOBLE_USDC_DENOM = 'uusdc';

export function getUsdcAddress(chainId: number): string {
  const address = getTokenAddress(chainId, 'USDC');
  if (address) return address;
  return '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
}


export const SKIP_BRIDGES = ['CCTP', 'GO_FAST', 'IBC', 'AXELAR'] as const;

export const NATIVE_WALLET_GAS_RESERVE_UUSDC = 20_000; // $0.020
export const NATIVE_WALLET_GAS_RESERVE_USD = NATIVE_WALLET_GAS_RESERVE_UUSDC / 1e6; // 0.02

export function computeDepositSplit(walletBalanceUusdc: number): {
  keepUusdc: number;
  depositUusdc: number;
} {
  const keepUusdc = Math.min(walletBalanceUusdc, NATIVE_WALLET_GAS_RESERVE_UUSDC);
  const depositUusdc = Math.max(0, walletBalanceUusdc - keepUusdc);
  return { keepUusdc, depositUusdc };
}

export function dydxToNoble(dydxAddress: string): string {
  try {
    const { data } = fromBech32(dydxAddress);
    return toBech32('noble', data);
  } catch {
    return dydxAddress.replace(/^dydx/, 'noble');
  }
}

export function makeNobleSignerFromDydx(dydxSigner: any) {
  return {
    async getAccounts() {
      const accounts = await dydxSigner.getAccounts();
      return accounts.map((acc: any) => ({
        ...acc,
        address: toBech32('noble', fromBech32(acc.address).data),
      }));
    },
    async signDirect(signerAddress: string, signDoc: any) {
      const dydxAddress = toBech32('dydx', fromBech32(signerAddress).data);
      return dydxSigner.signDirect(dydxAddress, signDoc);
    },
  };
}

export function getEvmSourceDenom(
  symbol: string,
  chainId: number,
  address?: string,
  isNative?: boolean
): string {
  if (chainId === 9000000 || chainId === 9000001) {
    console.log('stellar', symbol);
    if (isNative || symbol.toUpperCase() === 'XLM') {
      return 'stellar-native';
    }
    if (address && address.startsWith('G') && address.length >= 56) {
      return `stellar:${address}`;
    }
    const issuer = getTokenAddress(chainId, symbol as any);
    console.log(issuer, "source of issue ------- stealr ")
    if (issuer) return `stellar:${issuer}`;
    return 'stellar-native';
  }

  // EVM native coins
  if (isNative) {
    const chain = getChainById(chainId);
    if (chain?.skipChainName) {
      return `${chain.skipChainName}-native`;
    }

    switch (chainId) {
      case 1: return 'ethereum-native';
      case 56: return 'binance-native';
      case 137: return 'polygon-native';
      case 42161: return 'arbitrum-native';
      case 10: return 'optimism-native';
      case 8453: return 'base-native';
      case 43114: return 'avalanche-native';
      default: {
        const prefix = chain?.slug || 'native';
        return prefix === 'native' ? 'native' : `${prefix}-native`;
      }
    }
  }
  if (address && address.startsWith('0x')) {
    return address.toLowerCase();
  }

  const registryAddress = getTokenAddress(chainId, symbol as any);
  if (registryAddress && registryAddress.startsWith('0x')) {
    return registryAddress.toLowerCase();
  }

  const upperSymbol = symbol.toUpperCase();
  if (['USDC', 'USDT', 'DAI', 'USDT.E', 'USDC.E'].includes(upperSymbol)) {
    return getUsdcAddress(chainId);
  }

  return getUsdcAddress(chainId);
}

export function toAtomicAmount(amount: number, symbol: string, customDecimals?: number, chainId?: number): string {
  if (!amount || isNaN(amount)) return '0';

  let decimals: number;
  if (customDecimals !== undefined) {
    decimals = Number(customDecimals);
  } else if (symbol.toUpperCase() === 'ETH') {
    decimals = 18;
  } else if (
    chainId === 9000000 || chainId === 9000001
  ) {
    decimals = 7;
  } else {
    decimals = 6;
  }

  try {
    const parts = amount.toString().split('.');
    const integerPart = parts[0];
    let fractionalPart = parts[1] || '';

    if (fractionalPart.length > decimals) {
      fractionalPart = fractionalPart.slice(0, decimals);
    } else {
      fractionalPart = fractionalPart.padEnd(decimals, '0');
    }

    const result = (integerPart + fractionalPart).replace(/^0+/, '');
    return result || '0';
  } catch (err) {
    return Math.floor(amount * Math.pow(10, decimals)).toString();
  }
}

export function formatBridgeDuration(seconds: number): string {
  if (seconds < 30) return '< 30s';
  if (seconds < 90) return '~ 1 min';
  return `~ ${Math.round(seconds / 60)} min`;
}

export function sumEstimatedFeesUsd(estimatedFees: any[]): number {
  return (estimatedFees ?? []).reduce(
    (sum: number, f: any) => sum + parseFloat(f.usdAmount ?? '0'),
    0
  );
}

export function sumNobleFeesUusdc(estimatedFees: any[]): number {
  return (estimatedFees ?? []).reduce((sum: number, f: any) => {
    const isNoble = f.chainId === NOBLE_CHAIN_ID || f.originAssetChainId === NOBLE_CHAIN_ID;
    if (!isNoble) return sum;
    return sum + Math.ceil(parseFloat(f.usdAmount ?? '0') * 1e6);
  }, 0);
}

//Signer builders

export function buildCosmosSigner(rawSigner: any) {
  return async (chainId: string) => {
    if (chainId === DYDX_CHAIN_ID) return rawSigner;
    const prefix = COSMOS_CHAIN_PREFIXES[chainId];
    if (!prefix) {
      console.warn(
        `[buildCosmosSigner] Unknown Cosmos chain "${chainId}" — falling back to dydx prefix.`
      );
    }
    return makeCosmosSignerWithPrefix(rawSigner, prefix ?? 'dydx');
  };
}

export function makeCosmosSignerWithPrefix(dydxSigner: any, prefix: string) {
  return {
    async getAccounts() {
      const accounts = await dydxSigner.getAccounts();
      return accounts.map((acc: any) => ({
        ...acc,
        address: toBech32(prefix, fromBech32(acc.address).data),
      }));
    },
    async signDirect(signerAddress: string, signDoc: any) {
      const dydxAddress = toBech32('dydx', fromBech32(signerAddress).data);
      return dydxSigner.signDirect(dydxAddress, signDoc);
    },
    async signAmino(signerAddress: string, signDoc: any) {
      const dydxAddress = toBech32('dydx', fromBech32(signerAddress).data);
      return dydxSigner.signAmino?.(dydxAddress, signDoc);
    },
  };
}

const VIEM_CHAINS_BY_ID: Record<number, any> = Object.fromEntries(
  Object.values(viemChains)
    .filter((c: any) => typeof c?.id === 'number')
    .map((c: any) => [c.id, c])
);

export function buildEvmSigner(evmAddress: string, sessionProvider?: any) {
  return async (chainId: string) => {
    const provider = sessionProvider ?? (window as any).ethereum;
    if (!provider) throw new Error('No EVM provider available — wallet not connected');
    const chain = VIEM_CHAINS_BY_ID[Number(chainId)];
    if (!chain) throw new Error(`Unsupported EVM chain ID: ${chainId}`);
    return createWalletClient({
      account: evmAddress as `0x${string}`,
      chain,
      transport: custom(provider),
    });
  };
}

const COSMOS_CHAIN_PREFIXES: Record<string, string> = {
  'osmosis-1': 'osmo',
  'cosmoshub-4': 'cosmos',
  'axelar-dojo-1': 'axelar',
  'stride-1': 'stride',
  'juno-1': 'juno',
  'stargaze-1': 'stars',
  'akash-network': 'akash',
  'kaiyo-1': 'kujira',
  'neutron-1': 'neutron',
  'pacific-1': 'sei',
  'injective-1': 'inj',
  [NOBLE_CHAIN_ID]: 'noble',
  [DYDX_CHAIN_ID]: 'dydx',
};

export function deriveCosmosAddress(dydxAddress: string, prefix: string): string {
  try {
    const { data } = fromBech32(dydxAddress);
    return toBech32(prefix, data);
  } catch {
    throw new Error(`Failed to derive ${prefix} address from dYdX address: ${dydxAddress}`);
  }
}

function isEvmChainId(chainId: string): boolean {
  return /^\d+$/.test(chainId);
}

export function buildUserAddresses(
  requiredChainIds: string[],
  { evmAddress, dydxAddress }: { evmAddress: string; dydxAddress: string; nobleAddress?: string }
): { chainId: string; address: string }[] {
  return requiredChainIds.map(chainId => {
    if (isEvmChainId(chainId)) return { chainId, address: evmAddress };
    const prefix = COSMOS_CHAIN_PREFIXES[chainId] ?? 'dydx';
    if (!COSMOS_CHAIN_PREFIXES[chainId]) {
      console.warn(`[buildUserAddresses] Unknown Cosmos chain "${chainId}" — using dydx prefix.`);
    }
    return { chainId, address: deriveCosmosAddress(dydxAddress, prefix) };
  });
}

export function isInsufficientGasError(err: any): boolean {
  const msg: string = (err?.message ?? err?.reason ?? '').toLowerCase();
  return (
    msg.includes('gas required exceeds allowance') ||
    msg.includes('unpredictable_gas_limit') ||
    msg.includes('insufficient funds for gas') ||
    (msg.includes('cannot estimate gas') && msg.includes('gas'))
  );
}

export async function fetchDydxWalletUsdcBalance(dydxAddress: string): Promise<number> {
  try {
    const res = await fetch(
      `https://dydx-rest.publicnode.com/cosmos/bank/v1beta1/balances/${dydxAddress}`
    );
    if (!res.ok) return 0;
    const { balances = [] } = await res.json();
    const coin = (balances as Array<{ denom: string; amount: string }>).find(
      b => b.denom === DYDX_USDC_DENOM
    );
    return parseInt(coin?.amount ?? '0', 10);
  } catch {
    return 0;
  }
}

export async function fetchDydxWalletUsdcBalanceHuman(dydxAddress: string): Promise<number> {
  const uusdc = await fetchDydxWalletUsdcBalance(dydxAddress);
  return uusdc / 1e6;
}
