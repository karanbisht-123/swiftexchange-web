import { create } from 'zustand';

import { type GeolocationData, fetchGeolocation } from '../utils/geolocationUtils';

interface GeolocationState {
  location: GeolocationData | null;
  isLoading: boolean;
  isError: boolean;
  fetchedAt: number | null;
  fetchLocation: () => Promise<void>;
  reset: () => void;
}

const TTL_MS = 15 * 60 * 1000;

export const useGeolocationStore = create<GeolocationState>((set, get) => ({
  location: null,
  isLoading: false,
  isError: false,
  fetchedAt: null,
  fetchLocation: async () => {
    const { isLoading, fetchedAt, location } = get();
    if (isLoading) return;
    if (location && fetchedAt && Date.now() - fetchedAt < TTL_MS) return;

    set({ isLoading: true, isError: false });
    try {
      const data = await fetchGeolocation();
      set({ location: data, isLoading: false, isError: false, fetchedAt: Date.now() });
    } catch (err) {
      console.log(err, 'gelocation error');
      set({ location: null, isLoading: false, isError: true, fetchedAt: null });
    }
  },
  reset: () => set({ location: null, isLoading: false, isError: false, fetchedAt: null }),
}));
