import type { ChartResolution } from '../types/stellarChart.types';

export const HORIZON_MAINNET = 'https://horizon.stellar.org';
export const HORIZON_TESTNET = 'https://horizon-testnet.stellar.org';

// Chart resolutions in milliseconds
export const CHART_RESOLUTIONS: Record<string, ChartResolution> = {
  '1m': 60000,
  '5m': 300000,
  '15m': 900000,
  '1h': 3600000,
  '1d': 86400000,
  '1w': 604800000,
} as const;

// Default resolution
export const DEFAULT_RESOLUTION: ChartResolution = CHART_RESOLUTIONS['15m'];

// Maximum data points to fetch
export const MAX_DATA_POINTS = 200;

// Streaming reconnection settings
export const STREAM_RECONNECT_DELAY = 3000; // 3 seconds
export const STREAM_MAX_RETRIES = 5;

// Time range presets (in milliseconds)
export const TIME_RANGES = {
  '1H': 3600000, // 1 hour
  '4H': 14400000, // 4 hours
  '1D': 86400000, // 1 day
  '1W': 604800000, // 1 week
  '1M': 2592000000, // 30 days
  '3M': 7776000000, // 90 days
  '1Y': 31536000000, // 365 days
  ALL: 0, // All available data
} as const;

// Native asset identifier
export const NATIVE_ASSET = 'native';

// Asset codes
export const POPULAR_ASSETS = {
  XLM: {
    code: 'XLM',
    issuer: undefined,
    type: 'native',
  },
  USDC: {
    code: 'USDC',
    issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
    type: 'credit_alphanum4',
  },
  AQUA: {
    code: 'AQUA',
    issuer: 'GBNZILSTVQZ4R7IKQDGHYGY2QXL5QOFJYQMXPKWRRM5PAV7Y4M67AQUA',
    type: 'credit_alphanum4',
  },
  yXLM: {
    code: 'yXLM',
    issuer: 'GARDNV3Q7YGT4AKSDF25LT32YSCCW4EV22Y2TV3I2PU2MMXJTEDL5T55',
    type: 'credit_alphanum4',
  },
} as const;

// Data refresh intervals
export const REFRESH_INTERVAL = {
  '1m': 60000, // 1 minute
  '5m': 300000, // 5 minutes
  '15m': 900000, // 15 minutes
  '1h': 3600000, // 1 hour
  '1d': 86400000, // 1 day
} as const;

// Chart display settings
export const CHART_COLORS = {
  green: '#10b981',
  red: '#ef4444',
  blue: '#3b82f6',
  gray: '#6b7280',
} as const;
