/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_APP_MODE: 'development' | 'production';
    readonly VITE_BASE_SERVER_URL: string;
    readonly VITE_BASE_PROXY_URL: string;
    readonly VITE_API_DEVICE_AUTH: string;
    readonly VITE_API_DEVICE_JWT: string;
    readonly VITE_API_USER_AUTH: string;
    readonly VITE_WALLETCONNECT_PROJECT_ID: string;
    readonly VITE_WALLETCONNECT_RELAY_URL: string;
    readonly VITE_BASE_URL: string;
    readonly REACT_APP_COINMARKETCAP_API_KEY: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}