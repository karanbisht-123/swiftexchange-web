import { fromBech32, toBech32 } from '@cosmjs/encoding';
import { createWalletClient, custom } from 'viem';
import * as viemChains from 'viem/chains';
import { getTokenAddress, getChainById } from '../../evm/utils/Chainregistry';

export const DYDX_CHAIN_ID = 'dydx-mainnet-1';
export const NOBLE_CHAIN_ID = 'noble-1';

export const DYDX_USDC_DENOM =
  'ibc/8E27BA2D5493AF5636760E354E46004562C46AB7EC0CC4C1CA14E9E20E2545B5';

export const NOBLE_USDC_DENOM = 'uusdc';

const SKIP_CHAIN_NAME_MAP: Record<number | string, string> = {
  1: 'ethereum',
  56: 'binance',
  137: 'polygon',
  10: 'optimism',
  42161: 'arbitrum',
  8453: 'base',
  43114: 'avalanche',
};

export const SKIP_BRIDGES = ['CCTP', 'GO_FAST', 'IBC', 'AXELAR'] as const;

export const NATIVE_WALLET_GAS_RESERVE_UUSDC = 1_250_000; // $1.25 USD
export const NATIVE_WALLET_GAS_RESERVE_USD = NATIVE_WALLET_GAS_RESERVE_UUSDC / 1e6; // $1.25 USD

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
  chainId: number | string,
  address?: string,
  isNative?: boolean
): string {


  if (chainId === 'pubnet' || chainId === 'testnet') {
    if (isNative || symbol.toUpperCase() === 'XLM') {
      return 'stellar-native';
    }
    if (address && address.startsWith('G')) {
      return `stellar:${address}`;
    }
    const issuer = getTokenAddress(chainId, symbol as any);
    if (issuer) return `stellar:${issuer}`;
    return 'stellar-native';
  }

  // EVM native coins
  const lowerAddress = (address || "").toLowerCase();
  const isZeroAddress = lowerAddress === '0x0000000000000000000000000000000000000000' || lowerAddress === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

  if (isNative || isZeroAddress) {
    const skipName = SKIP_CHAIN_NAME_MAP[chainId] || getChainById(chainId)?.slug || 'native';
    return skipName === 'native' ? 'native' : `${skipName}-native`;
  }

  if (lowerAddress.startsWith('0x')) {
    return lowerAddress;
  }

  // Fallback to registry lookup by symbol
  const registryAddress = getTokenAddress(chainId, symbol as any);
  if (registryAddress && registryAddress.startsWith('0x')) {
    return registryAddress.toLowerCase();
  }

  return (address || "").toLowerCase();
}

export function toAtomicAmount(amount: number, symbol: string, customDecimals?: number, chainId?: number | string): string {
  if (!amount || isNaN(amount)) return '0';

  let decimals: number;
  if (customDecimals !== undefined) {
    decimals = Number(customDecimals);
  } else if (symbol.toUpperCase() === 'ETH') {
    decimals = 18;
  } else if (
    chainId === 'pubnet' || chainId === 'testnet'
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

    const client = createWalletClient({
      account: evmAddress as `0x${string}`,
      chain,
      transport: custom(provider),
    });

    const originalSendTransaction = client.sendTransaction.bind(client);
    client.sendTransaction = async (args: any) => {
      const parsedChainId = Number(chainId);
      if (parsedChainId === 137) {
        const minGasPrice = 30_000_000_000n;

        if (args.gasPrice !== undefined && args.gasPrice !== null) {
          const currentGasPrice = BigInt(args.gasPrice);
          if (currentGasPrice < minGasPrice) {
            args.gasPrice = minGasPrice;
          }
        }

        if (args.maxPriorityFeePerGas !== undefined && args.maxPriorityFeePerGas !== null) {
          const currentTip = BigInt(args.maxPriorityFeePerGas);
          if (currentTip < minGasPrice) {
            args.maxPriorityFeePerGas = minGasPrice;
          }
        }

        if (args.maxFeePerGas !== undefined && args.maxFeePerGas !== null) {
          const currentFee = BigInt(args.maxFeePerGas);
          if (currentFee < minGasPrice) {
            args.maxFeePerGas = minGasPrice + 10_000_000_000n;
          }
        }
      }
      return originalSendTransaction(args);
    };

    return client;
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
