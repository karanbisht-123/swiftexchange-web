export interface GeoLocationData {
  country: string;
  countryName: string;
  currency?: string;
}

let cachedGeoData: GeoLocationData | null = null;

export const getUserGeoLocation = async (): Promise<GeoLocationData | null> => {
  if (cachedGeoData) {
    return cachedGeoData;
  }

  try {
    const response = await fetch('http://ip-api.com/json/?fields=country,countryCode,currency', {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Geolocation API request failed');
    }

    const data = await response.json();

    if (data.countryCode) {
      cachedGeoData = {
        country: data.countryCode,
        countryName: data.country,
        currency: data.currency || undefined,
      };
      return cachedGeoData;
    }

    return null;
  } catch (error) {
    console.warn('Failed to fetch geolocation:', error);
    try {
      const fallbackResponse = await fetch('https://ipapi.co/json/', {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      });

      if (fallbackResponse.ok) {
        const fallbackData = await fallbackResponse.json();
        if (fallbackData.country_code) {
          cachedGeoData = {
            country: fallbackData.country_code,
            countryName: fallbackData.country_name,
            currency: fallbackData.currency,
          };
          return cachedGeoData;
        }
      }
    } catch (fallbackError) {
      console.warn('Fallback geolocation also failed:', fallbackError);
    }

    return null;
  }
};

export const clearGeoLocationCache = (): void => {
  cachedGeoData = null;
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
