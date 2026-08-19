import { useState, useEffect } from 'react';
import { ASTER_BAPI_URL } from '../constants';

const ASSET_LOGO_CACHE_KEY = 'aster_asset_logos';
const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

interface LogoCache {
  timestamp: number;
  data: Record<string, string>;
}

export const useAssetLogos = () => {
  const [logos, setLogos] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const fetchLogos = async () => {
      try {
        // Check cache first
        const cached = localStorage.getItem(ASSET_LOGO_CACHE_KEY);
        if (cached) {
          const parsedCache: LogoCache = JSON.parse(cached);
          if (Date.now() - parsedCache.timestamp < CACHE_EXPIRY) {
            if (isMounted) {
              setLogos(parsedCache.data);
              setIsLoading(false);
            }
            return;
          }
        }

        // Fetch if not cached or expired
        const response = await fetch(`${ASTER_BAPI_URL}/asset/ae/all-asset-logo`, {
          method: 'POST',
        });
        const json = await response.json();
        
        if (json.success && Array.isArray(json.data)) {
          const logoMap: Record<string, string> = {};
          json.data.forEach((item: any) => {
            if (item.assetCode && item.logoUrl) {
              logoMap[item.assetCode] = item.logoUrl;
            }
          });

          // Update cache
          localStorage.setItem(ASSET_LOGO_CACHE_KEY, JSON.stringify({
            timestamp: Date.now(),
            data: logoMap,
          }));

          if (isMounted) {
            setLogos(logoMap);
            setIsLoading(false);
          }
        }
      } catch (err) {
        console.error('Failed to fetch asset logos:', err);
        if (isMounted) setIsLoading(false);
      }
    };

    fetchLogos();

    return () => {
      isMounted = false;
    };
  }, []);

  return { logos, isLoading };
};
