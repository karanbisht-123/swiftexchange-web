export const IS_DEV = import.meta.env.DEV;
export const IS_PROD = import.meta.env.PROD;

export const API_CONFIG = {
    serverUrl: import.meta.env.VITE_BASE_SERVER_URL,
    proxyUrl: import.meta.env.VITE_BASE_PROXY_URL,
    deviceAuth: import.meta.env.VITE_API_DEVICE_AUTH,
    deviceJwt: import.meta.env.VITE_API_DEVICE_JWT,
    userToken: import.meta.env.VITE_API_USER_AUTH,
} as const;

if (IS_DEV) {
    const missing = (Object.entries(API_CONFIG) as [string, string][])
        .filter(([, v]) => !v)
        .map(([k]) => k);

    if (missing.length) {
        console.warn(`[apiConfig] Missing env vars: ${missing.join(', ')}`);
    }
}