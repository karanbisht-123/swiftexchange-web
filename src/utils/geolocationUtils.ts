export interface GeolocationData {
    country: string;
    countryCode: string;
    region: string;
    regionName: string;
    city: string;
    query: string;
}

export const fetchGeolocation = async (): Promise<GeolocationData> => {
    try {
        const response = await fetch('https://free.freeipapi.com/api/json');
        if (!response.ok) {
            throw new Error('Failed to fetch geolocation data');
        }
        const data = await response.json();

        console.log("data", data)

        return {
            country: data.countryName,
            countryCode: data.countryCode,
            region: data.regionCode,
            regionName: data.regionName,
            city: data.cityName,
            query: data.ipAddress,
        };
    } catch (error) {
        console.error('Geolocation fetch error:', error);
        throw error;
    }
};

export const isLocationRestricted = (
    userLocation: GeolocationData | null,
    restrictedLocations: string[]
): boolean => {
    if (!userLocation) return false;

    const uCountry = userLocation?.countryCode?.toUpperCase();
    const uRegion = userLocation?.region?.toUpperCase();

    return restrictedLocations.some((loc) => {
        const cleanLoc = loc.toUpperCase().trim();
        const delimiter = cleanLoc.includes(':') ? ':' : cleanLoc.includes('-') ? '-' : null;

        if (delimiter) {
            const [rCountry, rRegion] = cleanLoc.split(delimiter).map(s => s.trim());
            return uCountry === rCountry && uRegion === rRegion;
        }
        return uCountry === cleanLoc;
    });
};
