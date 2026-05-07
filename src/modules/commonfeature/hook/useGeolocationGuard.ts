import { useEffect } from 'react';
import { useGeolocationStore } from '../../../store/geolocationStore';
import { isLocationRestricted } from '../../../utils/geolocationUtils';

export const useGeolocationGuard = (restrictedLocations: string[]) => {
  const { location, isLoading, error, fetchLocation } = useGeolocationStore();

  useEffect(() => {
    if (!location && !isLoading) {
      fetchLocation();
    }
  }, [location, isLoading, fetchLocation]);

  const isRestricted = isLocationRestricted(location, restrictedLocations);

  return {
    isRestricted,
    location,
    isLoading,
    error,
  };
};
