import type { ApiResponse } from '../types/evm/apiResponse.type';
import {
  GAS_TTL,
  dropPnlInflight,
  getGasKey,
  getPnlCache,
  getPnlInflight,
  readLocalCache,
  readStaleCache,
  setPnlCache,
  setPnlInflight,
  writeLocalCache,
} from './apiCache';
import { API_CONFIG } from './apiConfig';

//Internal helpers

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 1,
  delay = 1000
): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, options);
      if (res.ok) return res;
      if (res.status >= 400 && res.status < 500) return res; // never retry 4xx
      if (i === retries - 1) return res;
    } catch (err) {
      if (i === retries - 1) throw err;
    }
    await new Promise(r => setTimeout(r, delay * (i + 1)));
  }
  throw new Error('Max retries reached');
}

async function parseError(res: Response): Promise<string> {
  try {
    const text = await res.text();
    if (!text) return res.statusText;
    const body = JSON.parse(text);
    const raw = body.message || body.error;
    if (Array.isArray(raw)) return raw.join('. ');
    if (typeof raw === 'string') return raw;
  } catch {
    /* ignore */
  }
  return res.statusText;
}

function makeHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-auth-device-token': API_CONFIG.deviceAuth,
    ...(API_CONFIG.userToken ? { Authorization: `Bearer ${API_CONFIG.userToken}` } : {}),
    ...extra,
  };
}

async function parseBody<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    // If the server returns a 200 OK but the body is plaintext (e.g. an upstream error message),
    // throw it so that parseSwapError can format it nicely instead of crashing the app.
    throw new Error(text);
  }
}

// Public API

export async function fetchApiResponseFromProxy<T>(
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' = 'POST',
  body?: unknown,
  retries?: number,
  keepalive: boolean = false,
  signal?: AbortSignal
): Promise<ApiResponse<T>> {
  const res = await fetchWithRetry(
    `${API_CONFIG.proxyUrl}${endpoint}`,
    {
      method,
      headers: makeHeaders(),
      body: body ? JSON.stringify(body) : undefined,
      keepalive,
      signal,
    },
    retries
  );
  if (!res.ok) throw new Error(`API error: ${await parseError(res)}`);
  return { data: await parseBody<T>(res) };
}

export async function fetchApiResponseFromServer<T>(
  endpoint: string,
  method: 'GET' | 'POST' | 'PATCH' = 'POST',
  body?: unknown,
  retries?: number
): Promise<ApiResponse<T>> {
  const res = await fetchWithRetry(
    `${API_CONFIG.serverUrl}${endpoint}`,
    { method, headers: makeHeaders(), body: body ? JSON.stringify(body) : undefined },
    retries
  );
  if (!res.ok) throw new Error(`API error: ${await parseError(res)}`);
  return { data: await parseBody<T>(res) };
}

// Wallet Gas Info

export interface WalletGasInfo {
  transactionCount: number;
  gasFeeData: {
    _type: string;
    gasPrice: string;
    maxFeePerGas: string;
    maxPriorityFeePerGas: string;
  };
}

export async function getWalletGasInfo(
  prefix: string,
  address: string
): Promise<WalletGasInfo | null> {
  const key = getGasKey(prefix, address);

  const cached = readLocalCache<WalletGasInfo>(key, GAS_TTL);
  if (cached) return cached;

  try {
    const { data } = await fetchApiResponseFromProxy<WalletGasInfo>(
      `/eth/wallet-address/${address}/info`,
      'GET'
    );
    if (data) {
      writeLocalCache(key, data);
      return data;
    }
    return null;
  } catch {
    return readStaleCache<WalletGasInfo>(key);
  }
}

//Stellar PnL

export async function fetchStellarPnl(
  address: string,
  from: string,
  to: string,
  includeExcel: boolean = false
): Promise<unknown> {
  const token = API_CONFIG.deviceJwt;
  if (!token) return null;

  const key = `${address}_${from}_${to}_${includeExcel}`;

  const cached = getPnlCache(key);
  if (cached) return cached;
  const inFlight = getPnlInflight(key);
  if (inFlight) return inFlight;

  const promise = (async () => {
    const summary = !includeExcel;
    const url = `/pnl?address=${address}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&nocache=true&summary=${summary}&excel=${includeExcel}`;

    const res = await fetchWithRetry(url, {
      method: 'GET',
      headers: {
        'x-auth-device-token': API_CONFIG.deviceAuth,
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) throw new Error(`Stellar PNL error: ${res.statusText}`);
    const data = await parseBody<unknown>(res);
    setPnlCache(key, data);
    return data;
  })();

  setPnlInflight(key, promise);
  try {
    return await promise;
  } finally {
    dropPnlInflight(key);
  }
}
