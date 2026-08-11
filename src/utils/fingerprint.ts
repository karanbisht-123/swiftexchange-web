let fingerprintPromise: Promise<string | undefined> | null = null;

export function prewarmFingerprint(): void {
  if (!fingerprintPromise) {
    fingerprintPromise = (async () => {
      try {
        // Dynamically import to keep it out of the main bundle
        const FingerprintJS = await import('@fingerprintjs/fingerprintjs');
        const fp = await FingerprintJS.load();
        const result = await fp.get();
        return result.visitorId;
      } catch (error) {
        console.warn('Failed to compute device fingerprint:', error);
        return undefined;
      }
    })();
  }
}

export async function getFingerprint(): Promise<string | undefined> {
  if (!fingerprintPromise) {
    prewarmFingerprint();
  }
  return await fingerprintPromise!;
}
