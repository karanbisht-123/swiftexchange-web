import { useWalletStore } from '../modules/walletconnect/store/walletConnectStore';
import type { ApiResponse } from '../types/evm/apiResponse.type';

const SERVER_URL_DEV = import.meta.env.VITE_BASE_SERVER_URL_DEV as string;
const PROXY_URL_DEV = import.meta.env.VITE_BASE_PROXY_URL_DEV as string;
const DEVICE_AUTH_DEV = import.meta.env.VITE_API_DEVICE_AUTH_DEV as string;

const SERVER_URL_PROD = import.meta.env.VITE_BASE_SERVER_URL_PROD as string;
const PROXY_URL_PROD = import.meta.env.VITE_BASE_PROXY_URL_PROD as string;
const DEVICE_AUTH_PROD = import.meta.env.VITE_API_DEVICE_AUTH_PROD as string;

const USER_API_TOKEN = import.meta.env.VITE_API_USER_AUTH;

function getApiConfig() {
  const network = useWalletStore.getState().network;

  if (network === 'testnet') {
    return {
      serverUrl: SERVER_URL_DEV,
      proxyUrl: PROXY_URL_DEV,
      deviceAuth: DEVICE_AUTH_DEV,
    };
  }

  return {
    serverUrl: SERVER_URL_DEV,
    proxyUrl: PROXY_URL_DEV,
    deviceAuth: DEVICE_AUTH_DEV,
  };
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries: number = 3,
  delay: number = 1000
): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return response;
      if (response.status === 401 || response.status === 403 || response.status === 404) {
        return response;
      }
      if (i === retries - 1) return response;
    } catch (error) {
      if (i === retries - 1) throw error;
    }
    await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
  }
  throw new Error('Max retries reached');
}

export async function fetchApiResponseFromProxy<T>(
  endpoint: string,
  method: 'GET' | 'POST' = 'POST',
  body?: unknown,
  retries?: number
): Promise<ApiResponse<T>> {
  const config = getApiConfig();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-auth-device-token': config.deviceAuth,
  };

  if (USER_API_TOKEN) {
    headers['Authorization'] = `Bearer ${USER_API_TOKEN}`;
  }

  const url = `${config.proxyUrl}${endpoint}`;

  const response = await fetchWithRetry(
    url,
    {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    },
    retries
  );

  if (!response.ok) {
    let errorMsg = response.statusText;
    try {
      const errorData = await response.json();
      const rawMessage = errorData.message || errorData.error;
      if (Array.isArray(rawMessage)) {
        errorMsg = rawMessage.join('. ');
      } else if (typeof rawMessage === 'string') {
        errorMsg = rawMessage;
      }
    } catch {
      // Ignore JSON parse error, let it use statusText
    }
    throw new Error(`API error: ${errorMsg}`);
  }

  const data = await response.json();
  return { data };
}

export async function fetchApiResponseFromServer<T>(
  endpoint: string,
  method: 'GET' | 'POST' | 'PATCH' = 'POST',
  body?: unknown,
  retries?: number
): Promise<ApiResponse<T>> {
  const config = getApiConfig();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-auth-device-token': config.deviceAuth,
  };

  if (USER_API_TOKEN) {
    headers['Authorization'] = `Bearer ${USER_API_TOKEN}`;
  }

  const url = `${config.serverUrl}${endpoint}`;

  const response = await fetchWithRetry(
    url,
    {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    },
    retries
  );

  if (!response.ok) {
    let errorMsg = response.statusText;
    try {
      const errorData = await response.json();
      const rawMessage = errorData.message || errorData.error;
      if (Array.isArray(rawMessage)) {
        errorMsg = rawMessage.join('. ');
      } else if (typeof rawMessage === 'string') {
        errorMsg = rawMessage;
      }
    } catch {
      // Ignore JSON parse error, let it use statusText
    }
    throw new Error(`API error: ${errorMsg}`);
  }

  const data = await response.json();
  return { data };
}
