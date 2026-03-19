import { fromBech32, toBech32 } from '@cosmjs/encoding';
import { createWalletClient, custom } from 'viem';
import * as viemChains from 'viem/chains';

export const DYDX_CHAIN_ID = 'dydx-mainnet-1';
export const NOBLE_CHAIN_ID = 'noble-1';

export const DYDX_USDC_DENOM =
  'ibc/8E27BA2D5493AF5636760E354E46004562C46AB7EC0CC4C1CA14E9E20E2545B5';

export const NOBLE_USDC_DENOM = 'uusdc';

export const USDC_EVM_CONTRACTS: Record<number, string> = {
  1: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  137: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
  42161: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  10: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
  8453: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
};

const ETH_EVM_DENOMS: Record<number, string> = {
  1: 'ethereum-native',
};

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

export function getEvmSourceDenom(symbol: string, chainId: number): string {
  switch (symbol.toUpperCase()) {
    case 'ETH':
      return ETH_EVM_DENOMS[chainId] ?? 'ethereum-native';
    case 'USDC':
    case 'USDT':
      return USDC_EVM_CONTRACTS[chainId] ?? USDC_EVM_CONTRACTS[1];
    default:
      return USDC_EVM_CONTRACTS[chainId] ?? USDC_EVM_CONTRACTS[1];
  }
}

export function toAtomicAmount(amount: number, symbol: string): string {
  const decimals = symbol.toUpperCase() === 'ETH' ? 18 : 6;
  return Math.floor(amount * 10 ** decimals).toString();
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

// ─── Signer builders ──────────────────────────────────────────────────────────

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