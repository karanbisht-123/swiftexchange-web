export interface AlchemyBuyOrderRequest {
  side: 'BUY';
  amount: string;
  fiatCurrency: string;
  cryptoCurrency: string;
  address: string;
  orderType: string;
  network: string;
  alpha2: string;
  payWayCode: string;
  depositType: number;
  memo?: string;
}

export interface AlchemyBuyOrderResponse {
  orderId?: string;
  status?: string;
  paymentUrl?: string;
  cryptoAmount?: string;
  fiatAmount?: string;
  fee?: number;
  total?: number;
  expiresAt?: string;
}

export interface AlchemyBuyOrderData {
  orderNo: string;
  payUrl: string;
  traceId: string;
}

export interface AlchemyBuyOrderSuccess {
  status: boolean;
  data?: string;
}

export interface AlchemyBuyOrderApiResponse {
  success: AlchemyBuyOrderSuccess;
  traceId?: string;
}

export interface AlchemyQuoteRequest {
  crypto: string;
  network: string;
  fiat: string;
  amount: string;
  side: 'BUY' | 'SELL';
}

export interface AlchemyQuoteData {
  cryptoPrice: string;
  rampFee: string;
  cryptoNetworkFee: string;
  cryptoQuantity: string;
  networkFee: string;
  rebateFiatAmount: string;
  fiat: string;
  rawRampFee: string;
  rebateUsdAmount: string;
  crypto: string;
  payWayCode: string;
  rampFeeInUSD: string;
  fiatQuantity: any;
}

export interface AlchemyQuoteResponse {
  success: boolean;
  data?: AlchemyQuoteData;
  traceId?: string;
}

export interface AlchemySellOrderRequest {
  cryptoAmount: string;
  fiat: string;
  crypto: string;
  network: string;
  country: string;
}

export interface AlchemySellOrderResponse {
  orderId?: string;
  success?: boolean | string;
  fiatAmount?: string;
  cryptoAmount?: string;
  fee?: number;
  total?: number;
  depositAddress?: string;
  memo?: string;
  expiresAt?: string;
  bankDetails?: {
    accountNumber?: string;
    ifscCode?: string;
    accountHolderName?: string;
  };
}

export const PAYMENT_METHODS = {
  INDIA: {
    UPI: '52005',
    BANK_TRANSFER: '52001',
    PAYTM: '52009',
  },
  GLOBAL: {
    CARD: '10001',
    BANK_TRANSFER: '10002',
  },
} as const;

export const ORDER_TYPES = {
  MARKET: '4',
  LIMIT: '1',
} as const;
