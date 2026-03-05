const SKIP_API_BASE = 'https://api.skip.build';

const DYDX_CHAIN_ID = 'dydx-mainnet-1';
const NOBLE_CHAIN_ID = 'noble-1';
const DYDX_USDC_DENOM = 'ibc/8E27BA2D5493AF5636760E354E46004562C46AB7EC0CC4C1CA14E9E20E2545B5';
const NOBLE_USDC_DENOM = 'uusdc';

const USDC_EVM_CONTRACTS: Record<number, string> = {
    1: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    137: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
    42161: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    10: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
    8453: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
};

const ETH_EVM_DENOMS: Record<number, string> = {
    1: 'ethereum-native',
};

const BRIDGES = ['CCTP', 'GO_FAST', 'IBC', 'AXELAR'];

export interface SkipRoute {
    amountIn: string;
    amountOut: string;
    estimatedFees: number;
    estimatedDurationSeconds: number;
    usdAmountIn: string;
    usdAmountOut: string;
    operations: any[];
    txsRequired: number;
    sourceChainId: string;
    sourceAssetDenom: string;
}

export interface SkipMsgsResponse {
    txs: SkipTx[];
}

export interface SkipTx {
    evm_tx?: {
        chain_id: string;
        to: string;
        value: string;
        data: string;
        required_erc20_approvals?: {
            token_contract: string;
            spender: string;
            amount: string;
        }[];
    };
    cosmos_tx?: {
        chain_id: string;
        msgs: any[];
    };
}

function getSourceDenom(symbol: string, chainId: number): string {
    const sym = symbol.toUpperCase();
    if (sym === 'ETH') return ETH_EVM_DENOMS[chainId] || 'ethereum-native';
    if (sym === 'USDC' || sym === 'USDT') {
        return USDC_EVM_CONTRACTS[chainId] || USDC_EVM_CONTRACTS[1];
    }
    return USDC_EVM_CONTRACTS[chainId] || USDC_EVM_CONTRACTS[1];
}

function toAmountIn(amount: number, symbol: string): string {
    const sym = symbol.toUpperCase();
    if (sym === 'ETH') return Math.floor(amount * 1e18).toString();
    return Math.floor(amount * 1e6).toString();
}

async function skipPost<T>(path: string, body: object): Promise<T> {
    const res = await fetch(`${SKIP_API_BASE}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Skip API error (${res.status}): ${text}`);
    }
    return res.json();
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
        goFast: boolean = false
    ): Promise<SkipRoute> {
        const sourceDenom = getSourceDenom(assetSymbol, evmChainId);
        const amountIn = toAmountIn(amountHuman, assetSymbol);

        const raw: any = await skipPost('/v2/fungible/route', {
            source_asset_denom: sourceDenom,
            source_asset_chain_id: String(evmChainId),
            dest_asset_denom: DYDX_USDC_DENOM,
            dest_asset_chain_id: DYDX_CHAIN_ID,
            amount_in: amountIn,
            cumulative_affiliate_fee_bps: '0',
            allow_unsafe: true,
            smart_relay: true,
            smart_swap_options: { split_routes: false, evm_swaps: true },
            bridges: BRIDGES,
            allow_multi_tx: true,
            go_fast: goFast,
        });

        console.log('raw', raw);
        const totalFeesUsd = (raw.estimated_fees || []).reduce(
            (sum: number, f: any) => sum + parseFloat(f.usd_amount || '0'),
            0
        );

        console.log('totalFeesUsd', totalFeesUsd);
        return {
            amountIn,
            amountOut: raw.amount_out || '0',
            estimatedFees: totalFeesUsd,
            estimatedDurationSeconds: raw.estimated_route_duration_seconds || 180,
            usdAmountIn: raw.usd_amount_in || '0',
            usdAmountOut: raw.usd_amount_out || '0',
            operations: raw.operations || [],
            txsRequired: raw.txs_required || 1,
            sourceChainId: String(evmChainId),
            sourceAssetDenom: sourceDenom,
        };
    },

    async getDepositMsgs(
        route: SkipRoute,
        evmAddress: string,
        dydxAddress: string
    ): Promise<SkipMsgsResponse> {
        const body: any = {
            source_asset_denom: route.sourceAssetDenom,
            source_asset_chain_id: route.sourceChainId,
            dest_asset_denom: DYDX_USDC_DENOM,
            dest_asset_chain_id: DYDX_CHAIN_ID,
            amount_in: route.amountIn,
            amount_out: route.amountOut,
            address_list: [evmAddress, dydxAddress],
            operations: route.operations,
            estimated_amount_out: route.amountOut,
            slippage_tolerance_percent: '1',
        };

        return skipPost<SkipMsgsResponse>('/v2/fungible/msgs', body);
    },

    async getWithdrawalRoute(
        destChainId: number,
        amountHuman: number
    ): Promise<SkipRoute> {
        const destDenom = USDC_EVM_CONTRACTS[destChainId] || USDC_EVM_CONTRACTS[1];
        const amountIn = Math.floor(amountHuman * 1e6).toString();

        const raw: any = await skipPost('/v2/fungible/route', {
            source_asset_denom: NOBLE_USDC_DENOM,
            source_asset_chain_id: NOBLE_CHAIN_ID,
            dest_asset_denom: destDenom,
            dest_asset_chain_id: String(destChainId),
            amount_in: amountIn,
            cumulative_affiliate_fee_bps: '0',
            allow_unsafe: true,
            smart_relay: true,
            bridges: BRIDGES,
            allow_multi_tx: true,
        });

        const totalFeesUsd = (raw.estimated_fees || []).reduce(
            (sum: number, f: any) => sum + parseFloat(f.usd_amount || '0'),
            0
        );

        console.log('raw withdrw', raw);

        return {
            amountIn,
            amountOut: raw.amount_out || '0',
            estimatedFees: totalFeesUsd,
            estimatedDurationSeconds: raw.estimated_route_duration_seconds || 180,
            usdAmountIn: raw.usd_amount_in || '0',
            usdAmountOut: raw.usd_amount_out || '0',
            operations: raw.operations || [],
            txsRequired: raw.txs_required || 1,
            sourceChainId: NOBLE_CHAIN_ID,
            sourceAssetDenom: NOBLE_USDC_DENOM,
        };
    },

    getUsdcContractForChain(chainId: number): string {
        return USDC_EVM_CONTRACTS[chainId] || USDC_EVM_CONTRACTS[1];
    },

    formatDuration(seconds: number): string {
        if (seconds < 30) return '< 30s';
        if (seconds < 90) return '~ 1 min';
        if (seconds < 300) return `~ ${Math.round(seconds / 60)} min`;
        return `~ ${Math.round(seconds / 60)} min`;
    },
};
