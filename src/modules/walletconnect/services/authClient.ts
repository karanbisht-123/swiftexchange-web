import SignClient from '@walletconnect/sign-client';

import { WALLETCONNECT_METADATA, WALLETCONNECT_PROJECT_ID } from '../config/chains';

let signClientInstance: any = null;

export async function getSignClient(): Promise<any> {
  if (signClientInstance) return signClientInstance;
  signClientInstance = await SignClient.init({
    projectId: WALLETCONNECT_PROJECT_ID,
    metadata: WALLETCONNECT_METADATA,
  });
  return signClientInstance;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function fetchNonce(_address?: string): Promise<string> {
  return Math.random().toString(36).substring(2, 10);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function verifyAndGetJWT(_params: {
  message: string;
  signature: string;
  address: string;
}): Promise<string | null> {
  return null;
}

export function storeJWT(jwt: string): void {
  if (!jwt) return;
  localStorage.setItem('swiftex_jwt', jwt);
}

export function getJWT(): string | null {
  return localStorage.getItem('swiftex_jwt');
}

export function clearJWT(): void {
  localStorage.removeItem('swiftex_jwt');
}
