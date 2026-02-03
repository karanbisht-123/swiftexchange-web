export type TransactionType = 'SEND' | 'RECEIVE' | 'TRADE' | 'BRIDGE' | 'TRUST' | 'CLAIMABLE' | 'OTHER';

export interface UnifiedTransaction {
    id: string;
    date: string;
    isSuccess: boolean;
    hash: string;
    type: TransactionType;

    // Payment specific
    assetCode?: string;
    amount?: string;
    from?: string;
    to?: string;

    // Trade specific
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

    // Trustline specific
    limit?: string;
    trustee?: string;
    trustor?: string;

    // Claimable Balance specific
    sponsor?: string;
    claimants?: any[];

    details?: string;
}
