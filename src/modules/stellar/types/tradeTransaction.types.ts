export interface ActiveOffer {
  id: any;
  selling: {
    code: string;
    issuer?: string;
  };
  buying: {
    code: string;
    issuer?: string;
  };
  amount: string;
  price: string;
  lastModifiedTime: string;
}

export interface CompletedTrade {
  id: string;
  baseAsset: {
    code: string;
    issuer?: string;
  };
  counterAsset: {
    code: string;
    issuer?: string;
  };
  baseAmount: string;
  counterAmount: string;
  price: string;
  ledgerCloseTime: string;
  isBuy: boolean;
  trade_type: any;
  transactionHash?: string;
  operationId?: string;
}

export interface Pagination {
  cursor?: string;
  hasMore: boolean;
}
