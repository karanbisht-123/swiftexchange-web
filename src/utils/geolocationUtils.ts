export interface GeolocationData {
  country: string;
  countryCode: string;
  region: string;
  regionName: string;
  city: string;
  query: string;
}

const PROVIDERS: Array<() => Promise<GeolocationData>> = [
  async () => {
    const response = await fetch('https://free.freeipapi.com/api/json');
    if (!response.ok) throw new Error('freeipapi failed');
    const data = await response.json();
    if (!data.countryCode) throw new Error('freeipapi missing countryCode');
    return {
      country: data.countryName,
      countryCode: data.countryCode,
      region: data.regionCode,
      regionName: data.regionName,
      city: data.cityName,
      query: data.ipAddress,
    };
  },
  async () => {
    const response = await fetch('https://ipapi.co/json/');
    if (!response.ok) throw new Error('ipapi.co failed');
    const data = await response.json();
    if (!data.country_code) throw new Error('ipapi.co missing country_code');
    return {
      country: data.country_name,
      countryCode: data.country_code,
      region: data.region_code,
      regionName: data.region,
      city: data.city,
      query: data.ip,
    };
  },
  async () => {
    const response = await fetch('https://ipwho.is/');
    if (!response.ok) throw new Error('ipwho.is failed');
    const data = await response.json();
    if (!data.success || !data.country_code) throw new Error('ipwho.is missing country_code');
    return {
      country: data.country,
      countryCode: data.country_code,
      region: data.region_code,
      regionName: data.region,
      city: data.city,
      query: data.ip,
    };
  },
];

export const fetchGeolocation = async (): Promise<GeolocationData> => {
  let lastError: unknown = new Error('All geolocation providers failed');
  for (const provider of PROVIDERS) {
    try {
      return await provider();
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
};

export const isLocationRestricted = (
  userLocation: GeolocationData | null,
  restrictedLocations: string[]
): boolean => {
  if (!userLocation || !userLocation.countryCode) return true;

  const uCountry = userLocation.countryCode.toUpperCase();
  const uRegion = userLocation.region?.toUpperCase();

  return restrictedLocations.some(loc => {
    const cleanLoc = loc.toUpperCase().trim();
    const delimiter = cleanLoc.includes(':') ? ':' : cleanLoc.includes('-') ? '-' : null;

    if (delimiter) {
      const [rCountry, rRegion] = cleanLoc.split(delimiter).map(s => s.trim());
      return uCountry === rCountry && uRegion === rRegion;
    }
    return uCountry === cleanLoc;
  });
};
