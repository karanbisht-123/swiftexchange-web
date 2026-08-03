import type { Signer } from 'ethers';
import { signedRequest } from './auth';
import { ASTER_BAPI_URL, ASTER_ENDPOINTS } from '../constants';
import type {
  AsterAccountInfo,
  AsterBalance,
  AsterPositionRisk,
  MarginType,
  GetIncomeHistoryParams,
  IncomeRecord,
  SymbolLeverageBracket,
  AsterUserTrade,
} from '../types/account';

//Account info: balances, margin summary, positions, fee tier

export async function getAccountInfo(
  signer: Signer,
  userAddr: string
): Promise<AsterAccountInfo> {
  return signedRequest(signer, userAddr, 'GET', ASTER_ENDPOINTS.ACCOUNT);
}
// Per-asset balance: wallet balance, available balance, cross wallet balance.

export async function getBalance(
  signer: Signer,
  userAddr: string
): Promise<AsterBalance[]> {
  return signedRequest(signer, userAddr, 'GET', ASTER_ENDPOINTS.BALANCE);
}


// All open positions with entry price, mark price, unrealized PnL,
// leverage, liquidation price.

export async function getPositionRisk(
  signer: Signer,
  userAddr: string,
  symbol?: string
): Promise<AsterPositionRisk[]> {
  const p: Record<string, string> = {};
  if (symbol) p.symbol = symbol;
  return signedRequest(signer, userAddr, 'GET', ASTER_ENDPOINTS.POSITION_RISK, p);
}

export async function changeLeverage(
  signer: Signer,
  userAddr: string,
  symbol: string,
  leverage: number
): Promise<{ leverage: number; maxNotionalValue: string; symbol: string }> {
  return signedRequest(signer, userAddr, 'POST', ASTER_ENDPOINTS.LEVERAGE, {
    symbol,
    leverage: String(leverage),
  });
}

// Switch between ISOLATED and CROSSED margin mode for a symbol.

export async function changeMarginType(
  signer: Signer,
  userAddr: string,
  symbol: string,
  marginType: MarginType
): Promise<{ code: number; msg: string }> {
  return signedRequest(signer, userAddr, 'POST', ASTER_ENDPOINTS.MARGIN_TYPE, {
    symbol,
    marginType,
  });
}


// Add or reduce isolated position margin.
// type: 1 = add margin, 2 = reduce margin.

export async function changePositionMargin(
  signer: Signer,
  userAddr: string,
  symbol: string,
  amount: string,
  type: 1 | 2
): Promise<{ amount: number; code: number; msg: string; type: number }> {
  return signedRequest(signer, userAddr, 'POST', ASTER_ENDPOINTS.POSITION_MARGIN, {
    symbol,
    amount,
    type: String(type),
  });
}

/**
 * Leverage bracket info. Confirmed working at /fapi/v3/leverageBracket.
 * Pass symbol for a single market, omit for all markets.
 */
export async function getLeverageBracket(
  signer: Signer,
  userAddr: string,
  symbol?: string
): Promise<SymbolLeverageBracket[]> {
  const p: Record<string, string> = {};
  if (symbol) p.symbol = symbol;
  return signedRequest(signer, userAddr, 'GET', ASTER_ENDPOINTS.LEVERAGE_BRACKET, p);
}


// getLeverageRemaining has been removed in favor of getLeverageBracket

export async function getIncomeHistory(
  signer: Signer,
  userAddr: string,
  params: GetIncomeHistoryParams = {}
): Promise<IncomeRecord[]> {
  const p: Record<string, string> = {};
  if (params.symbol) p.symbol = params.symbol;
  if (params.incomeType) p.incomeType = params.incomeType;
  if (params.startTime !== undefined) p.startTime = String(params.startTime);
  if (params.endTime !== undefined) p.endTime = String(params.endTime);
  if (params.limit !== undefined) p.limit = String(params.limit);
  return signedRequest(signer, userAddr, 'GET', ASTER_ENDPOINTS.INCOME, p);
}

export async function changeMultiAssetsMargin(
  signer: Signer,
  userAddr: string,
  multiAssetsMargin: boolean
): Promise<{ code: number; msg: string }> {
  return signedRequest(signer, userAddr, 'POST', ASTER_ENDPOINTS.MULTI_ASSETS_MARGIN, {
    multiAssetsMargin: multiAssetsMargin ? 'true' : 'false',
  });
}

export async function getMultiAssetsMargin(
  signer: Signer,
  userAddr: string
): Promise<{ multiAssetsMargin: boolean }> {
  return signedRequest(signer, userAddr, 'GET', ASTER_ENDPOINTS.MULTI_ASSETS_MARGIN);
}


export async function getUserTrades(
  signer: Signer,
  userAddr: string,
  symbol?: string,
  opts: { startTime?: number; endTime?: number; limit?: number; fromId?: number } = {}
): Promise<AsterUserTrade[]> {
  const p: Record<string, string> = {};
  if (symbol) p.symbol = symbol;
  if (opts.startTime !== undefined) p.startTime = String(opts.startTime);
  if (opts.endTime !== undefined) p.endTime = String(opts.endTime);
  if (opts.limit !== undefined) p.limit = String(opts.limit);
  if (opts.fromId !== undefined) p.fromId = String(opts.fromId);
  return signedRequest(signer, userAddr, 'GET', ASTER_ENDPOINTS.USER_TRADES, p);
}

// Deposit & Withdraw APIs

export async function getDepositAssets(chainIds: string, accountType: 'spot' | 'perp' = 'spot', networks: string = 'EVM') {
  const qs = new URLSearchParams({ chainIds, networks, accountType }).toString();
  const res = await fetch(`${ASTER_BAPI_URL}/aster/deposit/assets?${qs}`);
  const data = await res.json();
  if (!data.success) throw new Error(data.message || 'Failed to fetch deposit assets');
  return data.data;
}

export async function getWithdrawAssets(chainIds: string, accountType: 'spot' | 'perp' = 'spot', networks: string = 'EVM') {
  const qs = new URLSearchParams({ chainIds, networks, accountType }).toString();
  const res = await fetch(`${ASTER_BAPI_URL}/aster/withdraw/assets?${qs}`);
  const data = await res.json();
  if (!data.success) throw new Error(data.message || 'Failed to fetch withdraw assets');
  return data.data;
}

export async function estimateWithdrawFee(chainId: number, currency: string, accountType: 'spot' | 'perp' = 'spot', network: string = 'EVM') {
  const qs = new URLSearchParams({ chainId: String(chainId), network, currency, accountType }).toString();
  const res = await fetch(`${ASTER_BAPI_URL}/aster/estimate-withdraw-fee?${qs}`);
  const data = await res.json();
  if (!data.success) throw new Error(data.message || 'Failed to estimate withdraw fee');
  return data.data;
}

export async function getUserWithdrawInfo(signer: Signer, userAddr: string) {
  // Using POST with empty body, but it's signed
  return signedRequest(signer, userAddr, 'POST', ASTER_ENDPOINTS.ASTER_USER_WITHDRAW_INFO);
}

export async function submitWithdraw(
  signer: Signer,
  userAddr: string,
  params: {
    chainId: number;
    asset: string;
    amount: string;
    fee: string;
    receiver: string;
    userNonce: string;
    userSignature: string;
  }
) {
  // We send the V3 signed request, including the userSignature for the withdraw authorization
  return signedRequest(signer, userAddr, 'POST', ASTER_ENDPOINTS.ASTER_USER_WITHDRAW, {
    chainId: String(params.chainId),
    asset: params.asset,
    amount: params.amount,
    fee: params.fee,
    receiver: params.receiver,
    userNonce: params.userNonce,
    userSignature: params.userSignature,
  });
}

