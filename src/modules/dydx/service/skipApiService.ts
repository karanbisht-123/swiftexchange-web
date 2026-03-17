// import { messages, route, setClientOptions } from '@skip-go/client';
// setClientOptions({
//   endpointOptions: {
//     getRpcEndpointForChain: async (chainId: string) => {
//       const endpoints: Record<string, string> = {
//         'noble-1': 'https://noble-rpc.polkachu.com:443',
//         'dydx-mainnet-1': 'https://dydx-rpc.publicnode.com:443',
//       };
//       return endpoints[chainId] ?? undefined;
//     },
//     getRestEndpointForChain: async (chainId: string) => {
//       const endpoints: Record<string, string> = {
//         'noble-1': 'https://noble-api.polkachu.com',
//         'dydx-mainnet-1': 'https://dydx-rpc.publicnode.com:443',
//       };
//       return endpoints[chainId] ?? undefined;
//     },
//   },
// });
// const DYDX_CHAIN_ID = 'dydx-mainnet-1';
// const NOBLE_CHAIN_ID = 'noble-1';
// const DYDX_USDC_DENOM = 'ibc/8E27BA2D5493AF5636760E354E46004562C46AB7EC0CC4C1CA14E9E20E2545B5';
// const NOBLE_USDC_DENOM = 'uusdc';
// const USDC_EVM_CONTRACTS: Record<number, string> = {
//   1: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
//   137: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
//   42161: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
//   10: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
//   8453: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
// };
// const ETH_EVM_DENOMS: Record<number, string> = {
//   1: 'ethereum-native',
// };
// const BRIDGES = ['CCTP', 'GO_FAST', 'IBC', 'AXELAR'] as const;
// export interface SkipRoute {
//   amountIn: string;
//   amountOut: string;
//   estimatedFees: number;
//   estimatedDurationSeconds: number;
//   usdAmountIn: string;
//   usdAmountOut: string;
//   operations: any[];
//   txsRequired: number;
//   sourceChainId: string;
//   sourceAssetDenom: string;
//   requiredChainAddresses: string[];
// }
// export interface SkipEvmTx {
//   chainId: string;
//   to?: string;
//   value?: string;
//   data?: string;
//   requiredErc20Approvals?: {
//     amount: string;
//     spender: string;
//     tokenContract: string;
//   }[];
// }
// export interface SkipMsgsResponse {
//   evmTx: SkipEvmTx | null;
//   minAmountOut?: string;
// }
// function getSourceDenom(symbol: string, chainId: number): string {
//   const sym = symbol.toUpperCase();
//   if (sym === 'ETH') return ETH_EVM_DENOMS[chainId] || 'ethereum-native';
//   if (sym === 'USDC' || sym === 'USDT') {
//     return USDC_EVM_CONTRACTS[chainId] || USDC_EVM_CONTRACTS[1];
//   }
//   return USDC_EVM_CONTRACTS[chainId] || USDC_EVM_CONTRACTS[1];
// }
// function toAmountIn(amount: number, symbol: string): string {
//   const sym = symbol.toUpperCase();
//   if (sym === 'ETH') return Math.floor(amount * 1e18).toString();
//   return Math.floor(amount * 1e6).toString();
// }
// export const skipApiService = {
//   DYDX_CHAIN_ID,
//   NOBLE_CHAIN_ID,
//   DYDX_USDC_DENOM,
//   NOBLE_USDC_DENOM,
//   async getDepositRoute(
//     assetSymbol: string,
//     evmChainId: number,
//     amountHuman: number,
//     goFast: boolean = false
//   ): Promise<SkipRoute> {
//     const sourceDenom = getSourceDenom(assetSymbol, evmChainId);
//     const amountIn = toAmountIn(amountHuman, assetSymbol);
//     const raw = await route({
//       sourceAssetDenom: sourceDenom,
//       sourceAssetChainId: String(evmChainId),
//       destAssetDenom: DYDX_USDC_DENOM,
//       destAssetChainId: DYDX_CHAIN_ID,
//       amountIn,
//       cumulativeAffiliateFeeBps: '0',
//       allowUnsafe: false,
//       smartRelay: true,
//       smartSwapOptions: { splitRoutes: false, evmSwaps: true },
//       bridges: BRIDGES as any,
//       allowMultiTx: true,
//       goFast,
//     });
//     if (!raw) throw new Error('No route returned from Skip API');
//     const totalFeesUsd = (raw.estimatedFees || []).reduce(
//       (sum: number, f: any) => sum + parseFloat(f.usdAmount || '0'),
//       0
//     );
//     return {
//       amountIn,
//       amountOut: raw.amountOut || '0',
//       estimatedFees: totalFeesUsd,
//       estimatedDurationSeconds: raw.estimatedRouteDurationSeconds || 180,
//       usdAmountIn: raw.usdAmountIn || '0',
//       usdAmountOut: raw.usdAmountOut || '0',
//       operations: raw.operations || [],
//       txsRequired: raw.txsRequired || 1,
//       sourceChainId: String(evmChainId),
//       sourceAssetDenom: sourceDenom,
//       requiredChainAddresses: raw.requiredChainAddresses || [],
//     };
//   },
//   async getDepositMsgs(
//     skipRoute: SkipRoute,
//     evmAddress: string,
//     dydxAddress: string,
//     slippageTolerancePercent: string = '1'
//   ): Promise<SkipMsgsResponse> {
//     const chainIdsToAddresses: Record<string, string> = {};
//     for (const chainId of skipRoute.requiredChainAddresses) {
//       if (chainId === DYDX_CHAIN_ID) {
//         chainIdsToAddresses[chainId] = dydxAddress;
//       } else {
//         chainIdsToAddresses[chainId] = evmAddress;
//       }
//     }
//     const raw = await messages({
//       sourceAssetDenom: skipRoute.sourceAssetDenom,
//       sourceAssetChainId: skipRoute.sourceChainId,
//       destAssetDenom: DYDX_USDC_DENOM,
//       destAssetChainId: DYDX_CHAIN_ID,
//       amountIn: skipRoute.amountIn,
//       amountOut: skipRoute.amountOut,
//       chainIdsToAddresses,
//       operations: skipRoute.operations,
//       estimatedAmountOut: skipRoute.amountOut,
//       slippageTolerancePercent,
//       allowUnsafe: false,
//       smartRelay: true,
//     } as any);
//     if (!raw) throw new Error('No messages returned from Skip API');
//     const evmTxItem = (raw.txs || []).find((t: any) => 'evmTx' in t);
//     const evmTx = evmTxItem ? (evmTxItem as any).evmTx : null;
//     return {
//       evmTx,
//       minAmountOut: raw.minAmountOut,
//     };
//   },
//   async getWithdrawalRoute(destChainId: number, amountHuman: number): Promise<SkipRoute> {
//     const destDenom = USDC_EVM_CONTRACTS[destChainId] || USDC_EVM_CONTRACTS[1];
//     const amountIn = Math.floor(amountHuman * 1e6).toString();
//     const raw = await route({
//       sourceAssetDenom: NOBLE_USDC_DENOM,
//       sourceAssetChainId: NOBLE_CHAIN_ID,
//       destAssetDenom: destDenom,
//       destAssetChainId: String(destChainId),
//       amountIn,
//       cumulativeAffiliateFeeBps: '0',
//       allowUnsafe: false,
//       smartRelay: true,
//       bridges: BRIDGES as any,
//       allowMultiTx: true,
//     });
//     if (!raw) throw new Error('No withdrawal route returned from Skip API');
//     const totalFeesUsd = (raw.estimatedFees || []).reduce(
//       (sum: number, f: any) => sum + parseFloat(f.usdAmount || '0'),
//       0
//     );
//     return {
//       amountIn,
//       amountOut: raw.amountOut || '0',
//       estimatedFees: totalFeesUsd,
//       estimatedDurationSeconds: raw.estimatedRouteDurationSeconds || 180,
//       usdAmountIn: raw.usdAmountIn || '0',
//       usdAmountOut: raw.usdAmountOut || '0',
//       operations: raw.operations || [],
//       txsRequired: raw.txsRequired || 1,
//       sourceChainId: NOBLE_CHAIN_ID,
//       sourceAssetDenom: NOBLE_USDC_DENOM,
//       requiredChainAddresses: raw.requiredChainAddresses || [],
//     };
//   },
//   getUsdcContractForChain(chainId: number): string {
//     return USDC_EVM_CONTRACTS[chainId] || USDC_EVM_CONTRACTS[1];
//   },
//   formatDuration(seconds: number): string {
//     if (seconds < 30) return '< 30s';
//     if (seconds < 90) return '~ 1 min';
//     if (seconds < 300) return `~ ${Math.round(seconds / 60)} min`;
//     return `~ ${Math.round(seconds / 60)} min`;
//   },
// };
/**
 * skipApiService.ts
 *
 * Thin wrapper around the @skip-go/client `route` and `messages` functions.
 * Responsible only for constructing route/message requests — execution lives in the hooks.
 */
import { messages, route, setClientOptions } from '@skip-go/client';

import {
  DYDX_CHAIN_ID,
  DYDX_USDC_DENOM,
  NOBLE_CHAIN_ID,
  NOBLE_USDC_DENOM,
  SKIP_BRIDGES,
  USDC_EVM_CONTRACTS,
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

  /**
   * Fetch the optimal route from an EVM chain → dYdX subaccount.
   * goFast enables the GO_FAST bridge for faster (but sometimes pricier) transfers.
   */
  async getDepositRoute(
    assetSymbol: string,
    evmChainId: number,
    amountHuman: number,
    goFast = false
  ): Promise<SkipRoute> {
    const sourceAssetDenom = getEvmSourceDenom(assetSymbol, evmChainId);
    const amountIn = toAtomicAmount(amountHuman, assetSymbol);
    const sourceChainId = String(evmChainId);

    const raw = await route({
      sourceAssetDenom,
      sourceAssetChainId: sourceChainId,
      destAssetDenom: DYDX_USDC_DENOM,
      destAssetChainId: DYDX_CHAIN_ID,
      amountIn,
      cumulativeAffiliateFeeBps: '0',
      allowUnsafe: false,
      smartRelay: true,
      smartSwapOptions: { splitRoutes: false, evmSwaps: true },
      bridges: SKIP_BRIDGES as any,
      allowMultiTx: true,
      goFast,
    });

    if (!raw) throw new Error('Skip returned no deposit route');
    return normaliseRoute(raw, sourceChainId, sourceAssetDenom, amountIn);
  },

  // Fetch the optimal route from Noble → destination EVM chain.

  async getWithdrawalRoute(destEvmChainId: number, amountHuman: number): Promise<SkipRoute> {
    const destAssetDenom = USDC_EVM_CONTRACTS[destEvmChainId] ?? USDC_EVM_CONTRACTS[1];
    const amountIn = Math.floor(amountHuman * 1e6).toString();

    const raw = await route({
      sourceAssetDenom: NOBLE_USDC_DENOM,
      sourceAssetChainId: NOBLE_CHAIN_ID,
      destAssetDenom,
      destAssetChainId: String(destEvmChainId),
      amountIn,
      cumulativeAffiliateFeeBps: '0',
      allowUnsafe: false,
      smartRelay: true,
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

  getUsdcContractForChain: (chainId: number) =>
    USDC_EVM_CONTRACTS[chainId] ?? USDC_EVM_CONTRACTS[1],

  getSourceDenomForAsset: getEvmSourceDenom,

  toAmountIn: toAtomicAmount,

  formatDuration: formatBridgeDuration,
};
