export interface OrderPayload {
  assetId: string;
  isBuy: boolean;
  limitPx: string;
  sz: string;
  reduceOnly: boolean;
  orderType: 'Limit' | 'Market' | 'StopMarket' | 'TakeProfitMarket';
}

export interface CancelPayload {
  assetId: string;
  oid: string;
}

export interface SignatureResponse {
  signature: string;
  payload: unknown;
}

export interface PerpSigner {
  initialize(): Promise<void>;
  signOrder(order: OrderPayload): Promise<SignatureResponse>;
  signCancel(cancel: CancelPayload): Promise<SignatureResponse>;
}
