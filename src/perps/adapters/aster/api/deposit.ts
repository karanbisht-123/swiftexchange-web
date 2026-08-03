import type { Signer } from 'ethers';
import { signedRequest } from './auth';
import { ASTER_ENDPOINTS } from '../constants';

//Get deposit address for an asset.
export async function getDepositAddress(
  signer: Signer,
  userAddr: string,
  asset: string,
  network?: string
): Promise<{ address: string; tag?: string; url?: string }> {
  const p: Record<string, string> = { asset };
  if (network) p.network = network;
  return signedRequest(signer, userAddr, 'GET', ASTER_ENDPOINTS.DEPOSIT_ADDRESS, p);
}

//Apply for a withdrawal.
export async function applyWithdrawal(
  signer: Signer,
  userAddr: string,
  asset: string,
  address: string,
  amount: string,
  network?: string,
  memo?: string
): Promise<{ id: string }> {
  const p: Record<string, string> = { asset, address, amount };
  if (network) p.network = network;
  if (memo) p.memo = memo;
  return signedRequest(signer, userAddr, 'POST', ASTER_ENDPOINTS.WITHDRAW, p);
}

// Get deposit history.
export async function getDepositHistory(
  signer: Signer,
  userAddr: string,
  asset?: string,
  startTime?: number,
  endTime?: number,
  limit?: number
): Promise<any[]> {
  const p: Record<string, string> = {};
  if (asset) p.asset = asset;
  if (startTime) p.startTime = String(startTime);
  if (endTime) p.endTime = String(endTime);
  if (limit) p.limit = String(limit);
  return signedRequest(signer, userAddr, 'GET', ASTER_ENDPOINTS.DEPOSIT_HISTORY, p);
}

//  Get withdrawal history.
export async function getWithdrawalHistory(
  signer: Signer,
  userAddr: string,
  asset?: string,
  startTime?: number,
  endTime?: number,
  limit?: number
): Promise<any[]> {
  const p: Record<string, string> = {};
  if (asset) p.asset = asset;
  if (startTime) p.startTime = String(startTime);
  if (endTime) p.endTime = String(endTime);
  if (limit) p.limit = String(limit);
  return signedRequest(signer, userAddr, 'GET', ASTER_ENDPOINTS.WITHDRAW_HISTORY, p);
}
