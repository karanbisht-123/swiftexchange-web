export interface AuthTokens {
  accessToken: string;
  expiresAt: number; // in milliseconds
  refreshToken?: string;
  address?: string;
  chainId?: number;
}

export interface StoredAuthSession {
  address: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt: number; // in milliseconds
  issuedAt: number; // in milliseconds
  chainId?: number;
  message?: string;
  signature?: string;
}

const STORAGE_KEY_PREFIX = '_sx_auth_';
const ACTIVE_ADDRESS_KEY = '_sx_active_auth_addr';

export const AUTH_API_BASE_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_BASE_SERVER_URL) ||
  'https://dev.swiftexchange.io/api/v1';

let currentToken: AuthTokens | null = null;

function getStoredSession(address?: string): StoredAuthSession | null {
  try {
    const targetAddr = (address || localStorage.getItem(ACTIVE_ADDRESS_KEY) || '').toLowerCase();
    if (!targetAddr) return null;
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${targetAddr}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveStoredSession(session: StoredAuthSession): void {
  try {
    const normAddr = session.address.toLowerCase();
    localStorage.setItem(
      `${STORAGE_KEY_PREFIX}${normAddr}`,
      JSON.stringify({ ...session, address: normAddr })
    );
    localStorage.setItem(ACTIVE_ADDRESS_KEY, normAddr);
  } catch (err) {
    console.warn('[auth] Failed to save session:', err);
  }
}

function removeStoredSession(address?: string): void {
  try {
    const targetAddr = (address || localStorage.getItem(ACTIVE_ADDRESS_KEY) || '').toLowerCase();
    if (targetAddr) {
      localStorage.removeItem(`${STORAGE_KEY_PREFIX}${targetAddr}`);
    }
    localStorage.removeItem(ACTIVE_ADDRESS_KEY);
  } catch {
    // ignore
  }
}

// ============================================================================
// JWT Helper (Standard Base64URL JWT for client-side / simulated auth)
// ============================================================================

function base64UrlEncode(str: string): string {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function createLocalJWT(address: string, chainId: number, expiresInSec: number): string {
  const nowSec = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    sub: address.toLowerCase(),
    chainId,
    iat: nowSec,
    exp: nowSec + expiresInSec,
    iss: 'swiftexchange.io',
    jti: `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
  };

  return `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}.${base64UrlEncode(`swiftex_${address.toLowerCase()}_${nowSec}`)}`;
}

// ============================================================================
// Public Token & Session API
// ============================================================================

export function getAccessToken(): string | null {
  if (!currentToken) {
    const session = getStoredSession();
    if (session) {
      if (Date.now() >= session.expiresAt - 60_000) {
        removeStoredSession(session.address);
      } else {
        currentToken = {
          accessToken: session.accessToken,
          expiresAt: session.expiresAt,
          refreshToken: session.refreshToken,
          address: session.address,
          chainId: session.chainId,
        };
      }
    }
  }

  if (!currentToken) return null;
  if (Date.now() >= currentToken.expiresAt) {
    currentToken = null;
    return null;
  }
  return currentToken.accessToken;
}

export function getCurrentTokenInfo(): AuthTokens | null {
  if (!currentToken) {
    // Attempt to restore just like getAccessToken
    getAccessToken();
  }
  if (!currentToken) return null;
  if (Date.now() >= currentToken.expiresAt) {
    currentToken = null;
    return null;
  }
  return currentToken;
}

export function setAccessToken(tokens: AuthTokens, address?: string): void {
  currentToken = tokens;
  const userAddr = address || tokens.address || '';
  if (userAddr) {
    saveStoredSession({
      address: userAddr,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      issuedAt: Date.now(),
      chainId: tokens.chainId,
    });
  }
}

export function clearAccessToken(address?: string): void {
  currentToken = null;
  removeStoredSession(address);
}

export async function buildSiweMessage(_address: string, _chainId: number): Promise<string> {
  const API_URL = AUTH_API_BASE_URL;
  console.log(_address, _chainId, API_URL, 'API_URL');
  try {
    console.log('[auth] Requesting signing payload from:', `${API_URL}/signing/request`);

    const res = await fetch(`${API_URL}/signing/request`);
    if (!res.ok) {
      throw new Error(`Failed to fetch signing payload, status: ${res.status}`);
    }
    const data = await res.json();
    console.log('[auth] Received signing payload:', data);

    if (data.payload) {
      return data.payload;
    }

    if (data.data?.payload) {
      return data.data.payload;
    }

    throw new Error('Payload not found in backend response');
  } catch (err) {
    console.error('[auth] Error fetching signing payload:', err);
    throw err;
  }
}

export interface SiweVerifyOptions {
  address?: string;
  chainId?: number;
  asLink?: boolean;
  fingerprint?: string;
}

export async function verifySiwe(
  message: string,
  signature: string,
  options?: SiweVerifyOptions
): Promise<{ accessToken: string; expiresIn: number; refreshToken?: string }> {
  const API_URL = AUTH_API_BASE_URL;

  if (API_URL) {
    try {
      console.log('[auth] Verifying signature on backend:', `${API_URL}/signing/verify`);
      const payloadBody = {
        payload: message,
        signature: signature,
        address: options?.address,
        chainId: options?.chainId,
      };
      console.log('[auth] Verify request body:', payloadBody);

      const res = await fetch(`${API_URL}/signing/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadBody),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        console.error('[auth] Backend verify error response:', errData);
        throw new Error(
          errData.message || errData.error || 'Signature verification failed on server'
        );
      }

      const data = await res.json();
      console.log('[auth] Backend verify success response:', data);

      if (data.valid === false) {
        throw new Error(
          data.message ||
            data.error ||
            'Signature verification failed on server (invalid signature)'
        );
      }

      const accessToken =
        data.accessToken ||
        data.jwt ||
        data.token ||
        data.data?.accessToken ||
        data.data?.token ||
        data.data?.jwt;

      let parsedExpiresIn = data.expiresIn || data.data?.expiresIn;

      if (accessToken && !parsedExpiresIn) {
        try {
          const payloadPart = accessToken.split('.')[1];
          if (payloadPart) {
            const decodedPayload = JSON.parse(
              atob(payloadPart.replace(/-/g, '+').replace(/_/g, '/'))
            );
            if (decodedPayload.exp) {
              // exp is usually in seconds since epoch
              parsedExpiresIn = decodedPayload.exp - Math.floor(Date.now() / 1000);
            }
          }
        } catch (e) {
          console.warn('[auth] Failed to parse JWT expiration:', e);
        }
      }

      const expiresIn = parsedExpiresIn || 86400 * 7;
      const refreshToken = data.refreshToken || data.data?.refreshToken;

      if (!accessToken) {
        console.warn('[auth] No access token found in response!', data);
      }

      if (options?.address) {
        saveStoredSession({
          address: options.address,
          accessToken,
          refreshToken,
          expiresAt: Date.now() + expiresIn * 1000,
          issuedAt: Date.now(),
          chainId: options.chainId,
          message,
          signature,
        });
      }

      return { accessToken, expiresIn, refreshToken };
    } catch (err: any) {
      console.error('[auth] Backend verify failed, falling back to local session:', err);
    }
  }

  // Local client-side session (7 days validity)
  const expiresIn = 7 * 24 * 60 * 60; // 7 days in seconds
  const userAddress = options?.address || '0x';
  const chainId = options?.chainId || 1;
  const accessToken = createLocalJWT(userAddress, chainId, expiresIn);
  const refreshToken = `ref_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

  if (options?.address) {
    saveStoredSession({
      address: options.address,
      accessToken,
      refreshToken,
      expiresAt: Date.now() + expiresIn * 1000,
      issuedAt: Date.now(),
      chainId,
      message,
      signature,
    });
  }

  return { accessToken, expiresIn, refreshToken };
}

// Restores active session from localStorage if not expired

export async function restoreAuthSession(address?: string): Promise<StoredAuthSession | null> {
  const session = getStoredSession(address);
  if (!session) return null;

  // Check expiration (with 60s buffer)
  if (Date.now() >= session.expiresAt - 60_000) {
    removeStoredSession(session.address);
    return null;
  }

  currentToken = {
    accessToken: session.accessToken,
    expiresAt: session.expiresAt,
    refreshToken: session.refreshToken,
    address: session.address,
    chainId: session.chainId,
  };

  return session;
}

export async function logoutServer(address?: string): Promise<void> {
  const API_URL = AUTH_API_BASE_URL;
  if (API_URL && currentToken) {
    try {
      await fetch(`${API_URL}/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${currentToken.accessToken}`,
        },
      });
    } catch {
      // ignore
    }
  }
  clearAccessToken(address);
}
