export function getDeviceId(): string {
  try {
    const stored = localStorage.getItem('device_id');
    if (stored) {
      return stored;
    }
    const newId = crypto.randomUUID();
    localStorage.setItem('device_id', newId);
    return newId;
  } catch {
    const fallbackId =
      'fallback-' + Date.now().toString(36) + Math.random().toString(36).substring(2);
    try {
      localStorage.setItem('device_id', fallbackId);
    } catch {
      // Ignore
    }
    return fallbackId;
  }
}
