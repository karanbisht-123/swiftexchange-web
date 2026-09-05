import React, { type ReactNode, useEffect } from 'react';

import { useGeolocationStore } from '../../../store/geolocationStore';
import { isLocationRestricted } from '../../../utils/geolocationUtils';

interface GeolocationGuardProps {
  children: ReactNode;
  restrictedLocations: string[];
  fallback?: ReactNode;
  blocking?: boolean;
}

export const GeolocationGuard: React.FC<GeolocationGuardProps> = ({
  children,
  restrictedLocations,
  fallback,
  blocking = false,
}) => {
  const { location, isLoading, isError, fetchLocation } = useGeolocationStore();

  useEffect(() => {
    fetchLocation();
  }, [fetchLocation]);

  if (isLoading && !location) {
    if (blocking) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 py-10">
          <div className="relative w-8 h-8">
            <span className="absolute inset-0 rounded-full border-2 border-zinc-200 dark:border-zinc-700" />
            <span className="absolute inset-0 rounded-full border-2 border-t-zinc-900 dark:border-t-zinc-100 animate-spin" />
          </div>
          <p className="text-[11px] font-semibold tracking-[0.15em] uppercase text-zinc-400 dark:text-zinc-500">
            Verifying Region
          </p>
        </div>
      );
    }
    return null;
  }

  if (isError || !location) {
    if (fallback) return <>{fallback}</>;

    return (
      <div className="h-full flex justify-center items-center">
        <div className="relative overflow-hidden rounded-2xl border border-red-100 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 px-6 py-8 text-center ">
          <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-red-400 via-red-500 to-orange-400" />
          <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-red-100 dark:bg-red-900/30 mb-5">
            <svg
              className="w-5 h-5 text-red-500 dark:text-red-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M18.364 5.636A9 9 0 1 1 5.636 18.364 9 9 0 0 1 18.364 5.636M12 8v4m0 4h.01"
              />
            </svg>
          </div>
          <h3 className="text-sm font-bold tracking-wide text-red-600 dark:text-red-400 mb-1">
            Unable To Verify Region
          </h3>
          <p className="text-[12px] leading-relaxed text-zinc-500 dark:text-zinc-400 max-w-[220px] mx-auto">
            We couldn't confirm your region. This feature is unavailable until verification
            succeeds.
          </p>
        </div>
      </div>
    );
  }

  const restricted = isLocationRestricted(location, restrictedLocations);

  if (restricted) {
    if (fallback) return <>{fallback}</>;

    return (
      <div className="h-full flex justify-center items-center">
        <div className="relative overflow-hidden rounded-2xl border border-red-100 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20 px-6 py-8 text-center ">
          <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-red-400 via-red-500 to-orange-400" />
          <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-red-100 dark:bg-red-900/30 mb-5">
            <svg
              className="w-5 h-5 text-red-500 dark:text-red-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M18.364 5.636A9 9 0 1 1 5.636 18.364 9 9 0 0 1 18.364 5.636M12 8v4m0 4h.01"
              />
            </svg>
          </div>
          <h3 className="text-sm font-bold tracking-wide text-red-600 dark:text-red-400 mb-1">
            Region Restricted
          </h3>
          {location?.country && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-500 dark:text-red-400 text-[11px] font-medium mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
              {location.country}
              {location.countryCode && <span className="opacity-60">· {location.countryCode}</span>}
            </span>
          )}
          <p className="text-[12px] leading-relaxed text-zinc-500 dark:text-zinc-400 max-w-[220px] mx-auto">
            This feature isn't available in your region due to regulatory requirements.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
