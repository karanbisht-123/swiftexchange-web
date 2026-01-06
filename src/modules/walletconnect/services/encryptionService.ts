class EncryptionService {
  private readonly ENCRYPTION_KEY: string;

  constructor() {
    this.ENCRYPTION_KEY = import.meta.env.VITE_ENCRYPTION_KEY;
    if (!this.ENCRYPTION_KEY || this.ENCRYPTION_KEY.length < 32) {
      console.warn(
        ' VITE_ENCRYPTION_KEY is missing or too short. Using fallback (insecure for prod)!'
      );
    }
  }
  async encrypt(plainText: string): Promise<string> {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(this.paddedKey());

    const key = await crypto.subtle.importKey('raw', keyData, { name: 'AES-GCM' }, false, [
      'encrypt',
    ]);

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = encoder.encode(plainText);

    const encryptedBuffer = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
    const combined = new Uint8Array(iv.byteLength + encryptedBuffer.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encryptedBuffer), iv.byteLength);
    return btoa(String.fromCharCode(...combined));
  }

  async decrypt(encryptedBase64: string): Promise<string> {
    const decoder = new TextDecoder();
    const keyData = new TextEncoder().encode(this.paddedKey());

    const key = await crypto.subtle.importKey('raw', keyData, { name: 'AES-GCM' }, false, [
      'decrypt',
    ]);

    const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);

    const decryptedBuffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);

    return decoder.decode(decryptedBuffer);
  }

  private paddedKey(): string {
    const key = this.ENCRYPTION_KEY;
    return key.padEnd(32, '0').substring(0, 32);
  }
}

export const encryptionService = new EncryptionService();
