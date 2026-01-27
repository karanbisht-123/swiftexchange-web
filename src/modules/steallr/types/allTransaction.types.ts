export type TransactionType = 'SEND' | 'RECEIVE' | 'TRADE' | 'BRIDGE' | 'OTHER';

export interface UnifiedTransaction {
    id: string;
    date: string;
    isSuccess: boolean;
    hash: string;
    type: 'SEND' | 'RECEIVE' | 'TRADE' | 'BRIDGE' | 'OTHER';
    assetCode?: string;
    amount?: string;
    from?: string;
    to?: string;
    sellAsset?: string;
    buyAsset?: string;
    sellAmount?: string;
    buyAmount?: string;
    price?: string;
    offerId?: number | string;
    fromAsset?: string;
    toAsset?: string;
    fromAmount?: string;
    toAmount?: string;
    path?: any[];

    details?: string;
}
