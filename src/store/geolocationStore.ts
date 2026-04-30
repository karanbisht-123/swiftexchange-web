import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { fetchGeolocation, type GeolocationData } from '../utils/geolocationUtils';

interface GeolocationState {
    location: GeolocationData | null;
    isLoading: boolean;
    error: string | null;
    fetchLocation: (force?: boolean) => Promise<void>;
}

export const useGeolocationStore = create<GeolocationState>()(
    persist(
        (set, get) => ({
            location: null,
            isLoading: false,
            error: null,

            fetchLocation: async (force = false) => {
                if (get().location && !force) return;

                set({ isLoading: true, error: null });
                try {
                    const data = await fetchGeolocation();
                    set({ location: data, isLoading: false });
                } catch (error: any) {
                    set({ error: error.message || 'Failed to fetch location', isLoading: false });
                }
            },
        }),
        {
            name: 'swiftex-geolocation',
            storage: createJSONStorage(() => localStorage),
        }
    )
);
