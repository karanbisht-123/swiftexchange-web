import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearGeoLocationCache,
  getCountryCurrencyMap,
  getUserGeoLocation,
} from '../geoLocationService';

describe('geoLocationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearGeoLocationCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearGeoLocationCache();
  });

  describe('getUserGeoLocation', () => {
    it('successfully resolves geo location from primary provider (ipapi.co)', async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('ipapi.co')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              country_code: 'IN',
              country_name: 'India',
              currency: 'INR',
            }),
          });
        }
        return Promise.reject(new Error('Unknown URL'));
      });

      const data = await getUserGeoLocation();

      expect(data).toEqual({
        country: 'IN',
        countryName: 'India',
        currency: 'INR',
      });
    });

    it('falls back to secondary provider (ipwho.is) when ipapi.co fails', async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('ipapi.co')) {
          return Promise.resolve({
            ok: false,
            status: 500,
          });
        }
        if (url.includes('ipwho.is')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              success: true,
              country_code: 'US',
              country: 'United States',
              currency: { code: 'USD' },
            }),
          });
        }
        return Promise.reject(new Error('Unknown URL'));
      });

      const data = await getUserGeoLocation();

      expect(data).toEqual({
        country: 'US',
        countryName: 'United States',
        currency: 'USD',
      });
    });

    it('returns null when all providers fail', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network down'));

      const data = await getUserGeoLocation();

      expect(data).toBeNull();
    });

    it('returns cached data on repeated calls within TTL', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          country_code: 'GB',
          country_name: 'United Kingdom',
          currency: 'GBP',
        }),
      });
      global.fetch = fetchSpy;

      const firstCall = await getUserGeoLocation();
      const secondCall = await getUserGeoLocation();

      expect(firstCall).toEqual({
        country: 'GB',
        countryName: 'United Kingdom',
        currency: 'GBP',
      });
      expect(secondCall).toEqual(firstCall);
      // Fetch should only have been called once due to caching
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('bypasses cache when force is true', async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          country_code: 'FR',
          country_name: 'France',
          currency: 'EUR',
        }),
      });
      global.fetch = fetchSpy;

      await getUserGeoLocation(false);
      await getUserGeoLocation(true); // force refresh

      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('deduplicates concurrent in-flight requests', async () => {
      let resolveFetch: any;
      const fetchPromise = new Promise(resolve => {
        resolveFetch = resolve;
      });

      const fetchSpy = vi.fn().mockImplementation(() =>
        fetchPromise.then(() => ({
          ok: true,
          json: async () => ({
            country_code: 'DE',
            country_name: 'Germany',
            currency: 'EUR',
          }),
        }))
      );
      global.fetch = fetchSpy;

      // Trigger two concurrent requests while in-flight
      const call1 = getUserGeoLocation();
      const call2 = getUserGeoLocation();

      resolveFetch();

      const [res1, res2] = await Promise.all([call1, call2]);

      expect(res1).toEqual(res2);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('getCountryCurrencyMap', () => {
    it('provides standard fiat currency mapping for known country codes', () => {
      const map = getCountryCurrencyMap();

      expect(map.US).toBe('USD');
      expect(map.GB).toBe('GBP');
      expect(map.IN).toBe('INR');
      expect(map.DE).toBe('EUR');
      expect(map.JP).toBe('JPY');
      expect(map.AU).toBe('AUD');
      expect(map.CA).toBe('CAD');
    });
  });
});
