export interface Position {
  market: string;
  status: string;
  side: string;
  size: string;
  entryPrice: string;
  unrealizedPnl: string;
  realizedPnl: string;
  netFunding: string;
}

export interface Order {
  id: string;
  subaccountNumber: number;
  clientId: string;
  clobPairId: string;
  side: string;
  size: string;
  totalFilled: string;
  price: string;
  type: string;
  reduceOnly: boolean;
  timeInForce: string;
  postOnly: boolean;
  status: string;
  goodTilBlock?: string;
  goodTilBlockTime?: string;
  createdAtHeight: string;
  createdAt: string;
  updatedAt: string;
  updatedAtHeight: string;
  clientMetadata: string;
  ticker: string;
}

export interface TradeFill {
  id: string;
  subaccountNumber: number;
  side: string;
  liquidity: string;
  type: string;
  clobPairId: string;
  orderId: string;
  size: string;
  price: string;
  quoteAmount: string;
  eventId: string;
  transactionHash: string;
  createdAt: string;
  createdAtHeight: string;
  clientMetadata: string;
  fee: string;
  ticker: string;
}
