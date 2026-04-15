import { messages, route, setClientOptions } from '@skip-go/client';

import {
  DYDX_CHAIN_ID,
  DYDX_USDC_DENOM,
  NOBLE_CHAIN_ID,
  NOBLE_USDC_DENOM,
  SKIP_BRIDGES,
  getUsdcAddress,
  formatBridgeDuration,
  getEvmSourceDenom,
  sumEstimatedFeesUsd,
  toAtomicAmount,
} from '../utils/skipBridgeUtils';

// Client configuration
setClientOptions({
  endpointOptions: {
    getRpcEndpointForChain: async (chainId: string) => {
      const map: Record<string, string> = {
        'noble-1': 'https://noble-rpc.polkachu.com:443',
        'dydx-mainnet-1': 'https://dydx-rpc.publicnode.com:443',
      };
      return map[chainId];
    },
    getRestEndpointForChain: async (chainId: string) => {
      const map: Record<string, string> = {
        'noble-1': 'https://noble-api.polkachu.com',
        'dydx-mainnet-1': 'https://dydx-rpc.publicnode.com:443',
      };
      return map[chainId];
    },
  },
});

// Types
export interface SkipRoute {
  amountIn: string;
  amountOut: string;
  estimatedFeesUsd: number;
  estimatedDurationSeconds: number;
  usdAmountIn: string;
  usdAmountOut: string;
  operations: any[];
  txsRequired: number;
  sourceChainId: string;
  sourceAssetDenom: string;
  requiredChainAddresses: string[];
}

export interface SkipEvmTx {
  chainId: string;
  to?: string;
  value?: string;
  data?: string;
  requiredErc20Approvals?: {
    amount: string;
    spender: string;
    tokenContract: string;
  }[];
}

export interface SkipMsgsResponse {
  evmTx: SkipEvmTx | null;
  minAmountOut?: string;
}

function normaliseRoute(
  raw: any,
  sourceChainId: string,
  sourceAssetDenom: string,
  amountIn: string
): SkipRoute {
  return {
    amountIn,
    amountOut: raw.amountOut ?? '0',
    estimatedFeesUsd: sumEstimatedFeesUsd(raw.estimatedFees),
    estimatedDurationSeconds: raw.estimatedRouteDurationSeconds ?? 180,
    usdAmountIn: raw.usdAmountIn ?? '0',
    usdAmountOut: raw.usdAmountOut ?? '0',
    operations: raw.operations ?? [],
    txsRequired: raw.txsRequired ?? 1,
    sourceChainId,
    sourceAssetDenom,
    requiredChainAddresses: raw.requiredChainAddresses ?? [],
  };
}

export const skipApiService = {
  DYDX_CHAIN_ID,
  NOBLE_CHAIN_ID,
  DYDX_USDC_DENOM,
  NOBLE_USDC_DENOM,

  async getDepositRoute(
    assetSymbol: string,
    evmChainId: number,
    amountHuman: number,
    goFast = false,
    tokenAddress?: string,
    isNative?: boolean,
    decimals?: number
  ): Promise<SkipRoute> {
    const sourceAssetDenom = getEvmSourceDenom(assetSymbol, evmChainId, tokenAddress, isNative);
    const amountIn = toAtomicAmount(amountHuman, assetSymbol, decimals, evmChainId);
    const sourceChainId = String(evmChainId);

    const raw = await route({
      sourceAssetDenom,
      sourceAssetChainId: sourceChainId,
      destAssetDenom: DYDX_USDC_DENOM,
      destAssetChainId: DYDX_CHAIN_ID,
      amountIn,
      cumulativeAffiliateFeeBps: '0',
      allowUnsafe: true,
      smartRelay: true,
      smartSwapOptions: { splitRoutes: true, evmSwaps: true },
      experimentalFeatures: ['hyperlane', 'stargate', 'eureka', 'layer_zero'] as any,
      bridges: SKIP_BRIDGES as any,
      allowMultiTx: true,
      goFast,
    });

    if (!raw) throw new Error('Skip returned no deposit route');
    return normaliseRoute(raw, sourceChainId, sourceAssetDenom, amountIn);
  },

  // Fetch the optimal route from Noble → destination EVM chain.
  async getWithdrawalRoute(destEvmChainId: number, amountHuman: number): Promise<SkipRoute> {
    const destAssetDenom = getUsdcAddress(destEvmChainId);
    const amountIn = Math.floor(amountHuman * 1e6).toString();

    const raw = await route({
      sourceAssetDenom: NOBLE_USDC_DENOM,
      sourceAssetChainId: NOBLE_CHAIN_ID,
      destAssetDenom,
      destAssetChainId: String(destEvmChainId),
      amountIn,
      cumulativeAffiliateFeeBps: '0',
      allowUnsafe: true,
      smartRelay: true,
      experimentalFeatures: ['hyperlane', 'stargate', 'eureka', 'layer_zero'] as any,
      bridges: SKIP_BRIDGES as any,
      allowMultiTx: true,
    });

    if (!raw) throw new Error('Skip returned no withdrawal route');
    return normaliseRoute(raw, NOBLE_CHAIN_ID, NOBLE_USDC_DENOM, amountIn);
  },

  // Build the transaction messages for a deposit route.
  async getDepositMsgs(
    skipRoute: SkipRoute,
    evmAddress: string,
    dydxAddress: string,
    slippageTolerancePercent = '1'
  ): Promise<SkipMsgsResponse> {
    const chainIdsToAddresses: Record<string, string> = {};
    for (const chainId of skipRoute.requiredChainAddresses) {
      chainIdsToAddresses[chainId] = chainId === DYDX_CHAIN_ID ? dydxAddress : evmAddress;
    }

    const raw = await messages({
      sourceAssetDenom: skipRoute.sourceAssetDenom,
      sourceAssetChainId: skipRoute.sourceChainId,
      destAssetDenom: DYDX_USDC_DENOM,
      destAssetChainId: DYDX_CHAIN_ID,
      amountIn: skipRoute.amountIn,
      amountOut: skipRoute.amountOut,
      chainIdsToAddresses,
      operations: skipRoute.operations,
      estimatedAmountOut: skipRoute.amountOut,
      slippageTolerancePercent,
      allowUnsafe: false,
      smartRelay: true,
    } as any);

    if (!raw) throw new Error('Skip returned no deposit messages');

    const evmTxItem = (raw.txs ?? []).find((t: any) => 'evmTx' in t);
    return {
      evmTx: evmTxItem ? (evmTxItem as any).evmTx : null,
      minAmountOut: raw.minAmountOut,
    };
  },

  getUsdcContractForChain: (chainId: number) => getUsdcAddress(chainId),

  getSourceDenomForAsset: getEvmSourceDenom,

  toAmountIn: (amount: number, symbol: string, decimals?: number, chainId?: number) =>
    toAtomicAmount(amount, symbol, decimals, chainId),

  formatDuration: formatBridgeDuration,
};
