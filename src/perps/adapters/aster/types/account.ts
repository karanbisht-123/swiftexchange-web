// Account types for Aster v3.
//
// Fields marked [CONFIRMED] are taken directly from the Aster docs response payloads.
// Fields marked [UNCONFIRMED] were not available in the fetched docs pages —
// the account-info and positionRisk response schemas were truncated in the docs source.
// Verify these against a live /fapi/v3/account and /fapi/v3/positionRisk call.

export type MarginType = 'ISOLATED' | 'CROSSED';

// [UNCONFIRMED] Full account info response. The docs for /fapi/v3/account were not
// available in the fetched pages. Field names below are plausible but not verified.
// Test against a live authenticated response and adjust field names accordingly.
export interface AsterAccountInfo {
  feeTier: number;
  canTrade: boolean;
  canDeposit: boolean;
  canWithdraw: boolean;
  totalInitialMargin: string;
  totalMaintMargin: string;
  totalWalletBalance: string;
  totalUnrealizedProfit: string;
  totalMarginBalance: string;
  totalPositionInitialMargin: string;
  totalOpenOrderInitialMargin: string;
  totalCrossWalletBalance: string;
  availableBalance: string;
  maxWithdrawAmount: string;
  assets: AsterAssetBalance[];
  positions: AsterPositionRisk[];
}

// [UNCONFIRMED] Per-asset balance in account info. Verify field names against live response.
export interface AsterAssetBalance {
  asset: string;
  walletBalance: string;
  unrealizedProfit: string;
  marginBalance: string;
  maintMargin: string;
  initialMargin: string;
  positionInitialMargin: string;
  openOrderInitialMargin: string;
  crossWalletBalance: string;
  crossUnPnl: string;
  availableBalance: string;
  maxWithdrawAmount: string;
}

// [UNCONFIRMED] /fapi/v3/balance response shape. Verify field names against live response.
export interface AsterBalance {
  asset: string;
  balance: string;
  crossWalletBalance: string;
  crossUnPnl: string;
  availableBalance: string;
  maxWithdrawAmount: string;
}

// [UNCONFIRMED] /fapi/v3/positionRisk response shape. Verify field names against live response.
// The ACCOUNT_UPDATE WS payload uses: s, pa, ep, up, mt, iw, ps — which ARE confirmed.
// The REST positionRisk endpoint may use longer names.
export interface AsterPositionRisk {
  symbol: string;
  positionAmt: string;
  entryPrice: string;
  markPrice: string;
  unRealizedProfit: string;
  liquidationPrice: string;
  leverage: string;
  maxNotionalValue: string;
  marginType: string; // 'isolated' or 'cross' — verify casing in live response
  isolatedMargin: string;
  isAutoAddMargin: string;
  positionSide: string; // 'BOTH' | 'LONG' | 'SHORT'
  notional: string;
  isolatedWallet: string;
  updateTime: number;
}

// [UNCONFIRMED] Income history record. Verify incomeType values and field names against live.
export type IncomeType =
  'TRANSFER' | 'WELCOME_BONUS' | 'REALIZED_PNL' | 'FUNDING_FEE' | 'COMMISSION' | 'INSURANCE_CLEAR';

export interface GetIncomeHistoryParams {
  symbol?: string;
  incomeType?: IncomeType;
  startTime?: number;
  endTime?: number;
  limit?: number;
}

// [UNCONFIRMED] Verify field names against live /fapi/v3/income response.
export interface IncomeRecord {
  symbol: string;
  incomeType: IncomeType;
  income: string;
  asset: string;
  info?: string;
  time: number;
  tranId?: string | number;
  tradeId?: string | number;
}

// [UNCONFIRMED] Leverage bracket. Verify field names against live /fapi/v3/leverageBracket.
export interface LeverageBracket {
  bracket: number;
  initialLeverage: number;
  notionalCap: number;
  notionalFloor: number;
  maintMarginRatio: number;
  cum: number;
}

export interface SymbolLeverageBracket {
  symbol: string;
  brackets: LeverageBracket[];
}

// [UNCONFIRMED] User trade fill. Verify field names against live /fapi/v3/userTrades.
export interface AsterUserTrade {
  buyer: boolean;
  commission: string;
  commissionAsset: string;
  id: number;
  maker: boolean;
  orderId: number;
  price: string;
  qty: string;
  quoteQty: string;
  realizedPnl: string;
  side: string;
  positionSide: string;
  symbol: string;
  time: number;
}
