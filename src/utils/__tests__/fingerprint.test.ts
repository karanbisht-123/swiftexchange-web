import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('fingerprint utility', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns visitorId on success', async () => {
    vi.doMock('@fingerprintjs/fingerprintjs', () => ({
      load: vi.fn().mockResolvedValue({
        get: vi.fn().mockResolvedValue({ visitorId: 'test-visitor-id' }),
      }),
    }));

    const { getFingerprint } = await import('../fingerprint');
    const result = await getFingerprint();
    expect(result).toBe('test-visitor-id');
  });

  it('resolves to undefined on failure without throwing', async () => {
    vi.doMock('@fingerprintjs/fingerprintjs', () => ({
      load: vi.fn().mockRejectedValue(new Error('Simulated failure')),
    }));

    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { getFingerprint } = await import('../fingerprint');
    const result = await getFingerprint();

    expect(result).toBeUndefined();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
