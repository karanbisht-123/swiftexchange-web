import { getAccessToken } from '../modules/walletconnect/services/Siweauthservice';

export const IS_DEV = import.meta.env.DEV;
export const IS_PROD = import.meta.env.PROD;

function getValidDeviceToken(): string | null {
  const storedTimestamp = localStorage.getItem('device_token_timestamp');
  if (storedTimestamp) {
    const elapsed = Date.now() - parseInt(storedTimestamp, 10);
    const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
    if (elapsed > ONE_WEEK_MS) {
      localStorage.removeItem('device_token');
      localStorage.removeItem('device_token_timestamp');
      return null;
    }
  }
  return localStorage.getItem('device_token');
}

export const API_CONFIG = {
  serverUrl: import.meta.env.VITE_BASE_SERVER_URL,
  proxyUrl: import.meta.env.VITE_BASE_PROXY_URL,
  get deviceAuth(): string {
    return getValidDeviceToken() || getAccessToken() || import.meta.env.VITE_API_DEVICE_AUTH || '';
  },
  get deviceJwt(): string {
    return getValidDeviceToken() || getAccessToken() || '';
  },
} as const;

if (IS_DEV) {
  const missing = (Object.entries(API_CONFIG) as [string, string][])
    .filter(([, v]) => !v)
    .map(([k]) => k);

  if (missing.length) {
    console.warn(`[apiConfig] Missing env vars: ${missing.join(', ')}`);
  }
}
