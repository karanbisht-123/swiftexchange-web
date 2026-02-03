import { useEffect, useState } from 'react';

import {
    type GeoLocationData,
    getCountryCurrencyMap,
    getUserGeoLocation,
} from '../service/geoLocationService';

interface UseUserCountryReturn {
    country: string | null;
    countryName: string | null;
    currency: string | null;
    isLoading: boolean;
    error: string | null;
}

export const useUserCountry = (): UseUserCountryReturn => {
    const [geoData, setGeoData] = useState<GeoLocationData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchGeoLocation = async () => {
            setIsLoading(true);
            setError(null);

            try {
                const data = await getUserGeoLocation();

                if (data) {
                    if (!data.currency && data.country) {
                        const currencyMap = getCountryCurrencyMap();
                        data.currency = currencyMap[data.country];
                    }
                    setGeoData(data);
                } else {
                    setError('Could not detect location');
                }
            } catch (err) {
                setError('Failed to detect location');
                console.error('Geolocation error:', err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchGeoLocation();
    }, []);

    return {
        country: geoData?.country || null,
        countryName: geoData?.countryName || null,
        currency: geoData?.currency || null,
        isLoading,
        error,
    };
};
