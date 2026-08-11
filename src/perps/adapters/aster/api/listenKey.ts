import type { Signer } from 'ethers';
import { signedRequest } from './auth';
import { ASTER_ENDPOINTS } from '../constants';

// 55 minutes keepalive well before the 60-minute expiry window.
export const LISTEN_KEY_KEEPALIVE_MS = 55 * 60 * 1000;

// Create a new listenKey (or return the active one if one already exists).
export async function createListenKey(signer: Signer, userAddr: string): Promise<string> {
  const data = await signedRequest(signer, userAddr, 'POST', ASTER_ENDPOINTS.LISTEN_KEY);
  if (!data.listenKey) throw new Error(`Failed to create listenKey: ${JSON.stringify(data)}`);
  return data.listenKey as string;
}

// Extend the validity of the current listenKey by 60 minutes.
export async function keepaliveListenKey(signer: Signer, userAddr: string): Promise<void> {
  await signedRequest(signer, userAddr, 'PUT', ASTER_ENDPOINTS.LISTEN_KEY);
}
// Close the user data stream and invalidate the listenKey.
export async function deleteListenKey(signer: Signer, userAddr: string): Promise<void> {
  await signedRequest(signer, userAddr, 'DELETE', ASTER_ENDPOINTS.LISTEN_KEY);
}
