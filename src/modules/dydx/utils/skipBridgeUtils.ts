import { fromBech32, toBech32 } from '@cosmjs/encoding';
import { createWalletClient, custom } from 'viem';
import * as viemChains from 'viem/chains';


export const DYDX_CHAIN_ID = 'dydx-mainnet-1';
export const NOBLE_CHAIN_ID = 'noble-1';

// IBC-wrapped USDC denom on dYdX chain
export const DYDX_USDC_DENOM =
  'ibc/8E27BA2D5493AF5636760E354E46004562C46AB7EC0CC4C1CA14E9E20E2545B5';

// Native USDC denom on Noble
export const NOBLE_USDC_DENOM = 'uusdc';

// Native USDC contract addresses, keyed by EVM chain ID
export const USDC_EVM_CONTRACTS: Record<number, string> = {
  1: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', // Ethereum
  137: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', // Polygon
  42161: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // Arbitrum
  10: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', // Optimism
  8453: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // Base
};

// Native ETH denom strings, keyed by EVM chain ID
const ETH_EVM_DENOMS: Record<number, string> = {
  1: 'ethereum-native',
};

// Bridges we allow Skip to route through
export const SKIP_BRIDGES = ['CCTP', 'GO_FAST', 'IBC', 'AXELAR'] as const;

// ─── Address helpers ──────────────────────────────────────────────────────────

/**
 * Convert a dydx1... address to its noble1... equivalent.
 * Both chains share the same underlying key material — only the bech32 prefix differs.
 */
export function dydxToNoble(dydxAddress: string): string {
  try {
    const { data } = fromBech32(dydxAddress);
    return toBech32('noble', data);
  } catch {
    return dydxAddress.replace(/^dydx/, 'noble');
  }
}

/**
 * Wrap a dydx-prefixed offline signer so it advertises noble1... addresses
 * while still delegating actual signing to the underlying dydx signer.
 *
 * Skip requires the signer's reported address to match the chain prefix, but
 * we only have one key — re-prefixing lets us reuse it on Noble.
 */
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
      // Translate noble1... -> dydx1... before forwarding to the real signer
      const dydxAddress = toBech32('dydx', fromBech32(signerAddress).data);
      return dydxSigner.signDirect(dydxAddress, signDoc);
    },
  };
}



/** Resolve the correct source denom for a given asset symbol and EVM chain. */
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

/**
 * Sum only the fees that are deducted from the Noble chain wallet (in uusdc).
 * Used during withdrawal to compute a safe amountIn that leaves enough for gas.
 */
export function sumNobleFeesUusdc(estimatedFees: any[]): number {
  return (estimatedFees ?? []).reduce((sum: number, f: any) => {
    const isNoble = f.chainId === NOBLE_CHAIN_ID || f.originAssetChainId === NOBLE_CHAIN_ID;
    if (!isNoble) return sum;
    return sum + Math.ceil(parseFloat(f.usdAmount ?? '0') * 1e6);
  }, 0);
}

// ─── Signer builders ──────────────────────────────────────────────────────────

/**
 * Build the getCosmosSigner callback required by Skip's executeRoute.
 *
 * Per docs (Executing a route): getCosmosSigner takes a chainId and returns
 * Promise<OfflineSigner>. We use one key for all Cosmos chains, re-prefixing
 * the reported address to match each chain's bech32 prefix.
 *
 * This handles intermediate Cosmos hops (e.g. osmosis-1) that Skip may include
 * in routes — the dYdX wallet can sign for all of them since they share the
 * same secp256k1 key material.
 */
export function buildCosmosSigner(rawSigner: any) {
  return async (chainId: string) => {
    // dYdX: use signer as-is (already uses dydx1 prefix)
    if (chainId === DYDX_CHAIN_ID) return rawSigner;

    // All other Cosmos chains: wrap the signer to re-prefix addresses
    const prefix = COSMOS_CHAIN_PREFIXES[chainId];
    if (!prefix) {
      console.warn(
        `[deposit] buildCosmosSigner: unknown Cosmos chain "${chainId}" — ` +
        `falling back to dydx prefix. Add to COSMOS_CHAIN_PREFIXES if signing fails.`
      );
    }

    return makeCosmosSignerWithPrefix(rawSigner, prefix ?? 'dydx');
  };
}

/**
 * Generic version of makeNobleSignerFromDydx — wraps any offline signer to
 * report addresses with a given bech32 prefix while signing with the dYdX key.
 */
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
      // Translate prefixed address back to dydx1... before forwarding
      const dydxAddress = toBech32('dydx', fromBech32(signerAddress).data);
      return dydxSigner.signDirect(dydxAddress, signDoc);
    },
    async signAmino(signerAddress: string, signDoc: any) {
      const dydxAddress = toBech32('dydx', fromBech32(signerAddress).data);
      return dydxSigner.signAmino?.(dydxAddress, signDoc);
    },
  };
}

// viem chain lookup map (built once at module load)
const VIEM_CHAINS_BY_ID: Record<number, any> = Object.fromEntries(
  Object.values(viemChains)
    .filter((c: any) => typeof c?.id === 'number')
    .map((c: any) => [c.id, c])
);

/**
 * Build the getEvmSigner callback required by Skip's executeRoute.
 *
 * Per docs (Executing a route): getEvmSigner takes a chainId and returns
 * Promise<WalletClient>. We use the session provider (WalletConnect or injected)
 * and never call eth_requestAccounts — address is already known.
 */
export function buildEvmSigner(evmAddress: string, sessionProvider?: any) {
  return async (chainId: string) => {
    const provider = sessionProvider ?? (window as any).ethereum;
    if (!provider) throw new Error('No EVM provider available — wallet not connected');

    // Skip passes the numeric chain ID as a string — resolve to a viem chain object
    const chain = VIEM_CHAINS_BY_ID[Number(chainId)];
    if (!chain) throw new Error(`Unsupported EVM chain ID: ${chainId}`);

    return createWalletClient({
      account: evmAddress as `0x${string}`,
      chain,
      transport: custom(provider),
    });
  };
}

/**
 * Known bech32 prefixes for Cosmos chains that Skip may include as intermediate
 * hops (e.g. osmosis-1 when routing USDC via Osmosis DEX).
 * All share the same underlying key material as the dYdX wallet — only the
 * bech32 prefix differs.
 */
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

/**
 * Derive a bech32 address for any Cosmos chain from the dYdX wallet address.
 * All Cosmos chains using secp256k1 share the same underlying key bytes —
 * only the human-readable prefix differs.
 */
export function deriveCosmosAddress(dydxAddress: string, prefix: string): string {
  try {
    const { data } = fromBech32(dydxAddress);
    return toBech32(prefix, data);
  } catch {
    throw new Error(`Failed to derive ${prefix} address from dYdX address: ${dydxAddress}`);
  }
}

/**
 * Returns true if the chainId is an EVM chain (numeric string like "1", "137").
 * Cosmos chain IDs always contain at least one non-numeric character.
 */
function isEvmChainId(chainId: string): boolean {
  return /^\d+$/.test(chainId);
}

/**
 * Map Skip's requiredChainAddresses list to the correct user address for each chain.
 *
 * Per docs (Getting Started, Step 6):
 *   "route.requiredChainAddresses lists the chain IDs for which addresses are needed."
 *   "Only use addresses your user can sign for."
 *
 * Per docs (Executing a route, Required fields):
 *   "One user address per chain in the same order as route.requiredChainAddresses"
 *   "All user addresses must match the chain ids expected in the route, and must
 *    be valid for the corresponding chain type (Cosmos, Evm, or Svm)."
 *
 * KEY FIX: Skip's validateUserAddresses checks that Cosmos chain IDs receive a
 * valid bech32 address and EVM chain IDs receive a valid 0x address. When Skip
 * routes through an intermediate Cosmos chain (e.g. osmosis-1 for a USDC swap),
 * passing the EVM 0x address for that chain fails validation. We must derive the
 * correct bech32 address for every Cosmos chain from the dYdX wallet key.
 *
 * Route variations:
 *  - Normal:  ["1", "noble-1", "dydx-mainnet-1"]
 *  - Go Fast: ["1", "dydx-mainnet-1"]  (Noble skipped)
 *  - Via DEX: ["1", "osmosis-1", "noble-1", "dydx-mainnet-1"]  (Osmosis swap)
 */
export function buildUserAddresses(
  requiredChainIds: string[],
  {
    evmAddress,
    dydxAddress,
  }: { evmAddress: string; dydxAddress: string; nobleAddress?: string }
): { chainId: string; address: string }[] {
  return requiredChainIds.map(chainId => {
    // EVM chains: numeric string IDs ("1", "137", "42161", etc.)
    if (isEvmChainId(chainId)) {
      return { chainId, address: evmAddress };
    }

    // Cosmos chains: derive address using the chain's bech32 prefix.
    // Known chains use the lookup table; unknown chains fall back to the
    // dydx prefix (safe for chains that share the dydx key derivation path).
    const prefix = COSMOS_CHAIN_PREFIXES[chainId] ?? 'dydx';

    if (!COSMOS_CHAIN_PREFIXES[chainId]) {
      console.warn(
        `[deposit] Unknown Cosmos chain "${chainId}" — using dydx prefix as fallback. ` +
        `Add it to COSMOS_CHAIN_PREFIXES in skipBridgeUtils.ts if deposits fail.`
      );
    }

    const address = deriveCosmosAddress(dydxAddress, prefix);
    return { chainId, address };
  });
}


/**
 * Detect whether an error thrown during EVM transaction submission is a gas
 * estimation failure caused by insufficient ETH balance.
 *
 * The raw error from ethers/viem is UNPREDICTABLE_GAS_LIMIT with an inner
 * message "gas required exceeds allowance (N)" where N is the wallet's ETH
 * balance in gas units. This is entirely opaque to users — we translate it.
 */
export function isInsufficientGasError(err: any): boolean {
  const msg: string = (err?.message ?? err?.reason ?? '').toLowerCase();
  return (
    msg.includes('gas required exceeds allowance') ||
    msg.includes('unpredictable_gas_limit') ||
    msg.includes('insufficient funds for gas') ||
    (msg.includes('cannot estimate gas') && msg.includes('gas'))
  );
}
