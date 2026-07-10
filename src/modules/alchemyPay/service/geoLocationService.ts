export interface GeoLocationData {
  country: string;
  countryName: string;
  currency?: string;
}

interface CachedGeo {
  data: GeoLocationData;
  fetchedAt: number;
}

const TTL_MS = 15 * 60 * 1000;
let cachedGeoData: CachedGeo | null = null;
let inFlight: Promise<GeoLocationData | null> | null = null;

const PROVIDERS: Array<() => Promise<GeoLocationData>> = [
  async () => {
    const response = await fetch('https://ipapi.co/json/', {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error('ipapi.co failed');
    const data = await response.json();
    if (!data.country_code) throw new Error('ipapi.co missing country_code');
    return {
      country: data.country_code,
      countryName: data.country_name,
      currency: data.currency || undefined,
    };
  },
  async () => {
    const response = await fetch('https://ipwho.is/', {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error('ipwho.is failed');
    const data = await response.json();
    if (!data.success || !data.country_code) throw new Error('ipwho.is missing country_code');
    return {
      country: data.country_code,
      countryName: data.country,
      currency: data.currency?.code || undefined,
    };
  },
];

const resolveGeo = async (): Promise<GeoLocationData | null> => {
  for (const provider of PROVIDERS) {
    try {
      return await provider();
    } catch {
      continue;
    }
  }
  return null;
};

export const getUserGeoLocation = async (force = false): Promise<GeoLocationData | null> => {
  if (!force && cachedGeoData && Date.now() - cachedGeoData.fetchedAt < TTL_MS) {
    return cachedGeoData.data;
  }

  if (inFlight) return inFlight;

  inFlight = (async () => {
    const data = await resolveGeo();
    if (data) {
      cachedGeoData = { data, fetchedAt: Date.now() };
    } else {
      cachedGeoData = null;
    }
    inFlight = null;
    return data;
  })();

  return inFlight;
};

export const clearGeoLocationCache = (): void => {
  cachedGeoData = null;
  inFlight = null;
};

export const getCountryCurrencyMap = (): Record<string, string> => ({
  US: 'USD',
  GB: 'GBP',
  DE: 'EUR',
  FR: 'EUR',
  IT: 'EUR',
  ES: 'EUR',
  NL: 'EUR',
  BE: 'EUR',
  AT: 'EUR',
  PT: 'EUR',
  IE: 'EUR',
  FI: 'EUR',
  GR: 'EUR',
  IN: 'INR',
  JP: 'JPY',
  CN: 'CNY',
  KR: 'KRW',
  AU: 'AUD',
  CA: 'CAD',
  BR: 'BRL',
  MX: 'MXN',
  RU: 'RUB',
  ZA: 'ZAR',
  AE: 'AED',
  SG: 'SGD',
  HK: 'HKD',
  CH: 'CHF',
  SE: 'SEK',
  NO: 'NOK',
  DK: 'DKK',
  PL: 'PLN',
  TR: 'TRY',
  TH: 'THB',
  ID: 'IDR',
  MY: 'MYR',
  PH: 'PHP',
  VN: 'VND',
  NZ: 'NZD',
  IL: 'ILS',
  SA: 'SAR',
  NG: 'NGN',
  EG: 'EGP',
  PK: 'PKR',
  BD: 'BDT',
  CZ: 'CZK',
  HU: 'HUF',
  RO: 'RON',
  BG: 'BGN',
  HR: 'HRK',
  CL: 'CLP',
  CO: 'COP',
  AR: 'ARS',
  PE: 'PEN',
});
