import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type GeolocationData, fetchGeolocation, isLocationRestricted } from '../geolocationUtils';

const makeLocation = (overrides: Partial<GeolocationData> = {}): GeolocationData => ({
  country: 'United States',
  countryCode: 'US',
  region: 'CA',
  regionName: 'California',
  city: 'Los Angeles',
  query: '1.2.3.4',
  ...overrides,
});

describe('geolocationUtils', () => {
  describe('isLocationRestricted', () => {
    it('returns false when userLocation is null', () => {
      expect(isLocationRestricted(null, ['US'])).toBe(false);
    });

    it('returns true when countryCode matches a restricted country', () => {
      expect(isLocationRestricted(makeLocation({ countryCode: 'US' }), ['US'])).toBe(true);
    });

    it('returns false when countryCode does not match any restricted entry', () => {
      expect(isLocationRestricted(makeLocation({ countryCode: 'DE' }), ['US', 'CN'])).toBe(false);
    });

    it('is case-insensitive for restriction list entries', () => {
      expect(isLocationRestricted(makeLocation({ countryCode: 'US' }), ['us'])).toBe(true);
    });

    it('returns true when country+region matches a colon-delimited restriction', () => {
      expect(
        isLocationRestricted(makeLocation({ countryCode: 'US', region: 'NY' }), ['US:NY'])
      ).toBe(true);
    });

    it('returns false when region does not match a colon-delimited restriction', () => {
      expect(
        isLocationRestricted(makeLocation({ countryCode: 'US', region: 'CA' }), ['US:NY'])
      ).toBe(false);
    });

    it('returns true when country+region matches a hyphen-delimited restriction', () => {
      expect(
        isLocationRestricted(makeLocation({ countryCode: 'US', region: 'TX' }), ['US-TX'])
      ).toBe(true);
    });

    it('returns false when country does not match a hyphen-delimited restriction', () => {
      expect(
        isLocationRestricted(makeLocation({ countryCode: 'CA', region: 'TX' }), ['US-TX'])
      ).toBe(false);
    });

    it('returns false when restricted list is empty', () => {
      expect(isLocationRestricted(makeLocation(), [])).toBe(false);
    });

    it('matches when restriction has extra whitespace', () => {
      expect(isLocationRestricted(makeLocation({ countryCode: 'US' }), [' US '])).toBe(true);
    });
  });

  describe('fetchGeolocation', () => {
    beforeEach(() => {
      vi.stubGlobal('fetch', vi.fn());
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('returns a mapped GeolocationData on a successful response', async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({
          countryName: 'United States',
          countryCode: 'US',
          regionCode: 'CA',
          regionName: 'California',
          cityName: 'Los Angeles',
          ipAddress: '1.2.3.4',
        }),
      } as Response);

      const result = await fetchGeolocation();

      expect(result).toEqual({
        country: 'United States',
        countryCode: 'US',
        region: 'CA',
        regionName: 'California',
        city: 'Los Angeles',
        query: '1.2.3.4',
      });
    });

    it('throws when the HTTP response is not ok', async () => {
      vi.mocked(fetch).mockResolvedValue({ ok: false } as Response);
      await expect(fetchGeolocation()).rejects.toThrow('Failed to fetch geolocation data');
    });

    it('rethrows network-level fetch errors', async () => {
      vi.mocked(fetch).mockRejectedValue(new Error('Network error'));
      await expect(fetchGeolocation()).rejects.toThrow('Network error');
    });
  });
});
