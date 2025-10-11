import { isAddress } from 'ethers';

export class StellarValidator {
  static isValidStellarPublicKey(key: string): boolean {
    return /^G[A-Z0-9]{55}$/.test(key);
  }

  static isValidStellarPrivateKey(key: string): boolean {
    return /^S[A-Z0-9]{55}$/.test(key);
  }

  static validateStellarData(wallet: any): boolean {
    if (!wallet || typeof wallet !== 'object') {
      console.error('Invalid Stellar wallet data structure');
      return false;
    }

    const { stellarPublicKey, stellarPrivateKey } = wallet;

    if (!this.isValidStellarPublicKey(stellarPublicKey)) {
      console.error('Invalid Stellar public key format');
      return false;
    }

    if (!this.isValidStellarPrivateKey(stellarPrivateKey)) {
      console.error('Invalid Stellar private key format');
      return false;
    }

    return true;
  }
}

export class SecurityUtils {
  private static readonly ALGORITHM = 'AES-GCM';
  private static readonly KEY_LENGTH = 256;
  private static readonly IV_LENGTH = 12;
  private static encryptionKey: CryptoKey | null = null;

  private static async initializeKey(): Promise<CryptoKey> {
    if (this.encryptionKey) return this.encryptionKey;

    try {
      this.encryptionKey = await window.crypto.subtle.generateKey(
        {
          name: this.ALGORITHM,
          length: this.KEY_LENGTH,
        },
        false,
        ['encrypt', 'decrypt']
      );

      return this.encryptionKey;
    } catch (error) {
      console.error('Failed to initialize encryption key:', error);
      throw new Error('Web Crypto API not available or failed to initialize');
    }
  }

  static async encryptData(plainText: string): Promise<string> {
    if (!window.crypto || !window.crypto.subtle) {
      throw new Error('Web Crypto API not supported');
    }
    try {
      const key = await this.initializeKey();
      const iv = window.crypto.getRandomValues(new Uint8Array(this.IV_LENGTH));
      const encoder = new TextEncoder();
      const data = encoder.encode(plainText);

      const encrypted = await window.crypto.subtle.encrypt(
        {
          name: this.ALGORITHM,
          iv: iv,
        },
        key,
        data
      );
      const combined = new Uint8Array(iv.length + encrypted.byteLength);
      combined.set(iv);
      combined.set(new Uint8Array(encrypted), iv.length);
      return btoa(String.fromCharCode(...combined));
    } catch (error) {
      console.error('Encryption failed:', error);
      throw new Error('Failed to encrypt data');
    }
  }

  static async decryptData(encryptedData: string): Promise<string> {
    if (!window.crypto || !window.crypto.subtle) {
      throw new Error('Web Crypto API not supported');
    }

    try {
      const key = await this.initializeKey();
      const combined = new Uint8Array(
        atob(encryptedData)
          .split('')
          .map(char => char.charCodeAt(0))
      );
      const iv = combined.slice(0, this.IV_LENGTH);
      const encrypted = combined.slice(this.IV_LENGTH);

      const decrypted = await window.crypto.subtle.decrypt(
        {
          name: this.ALGORITHM,
          iv: iv,
        },
        key,
        encrypted
      );

      const decoder = new TextDecoder();
      return decoder.decode(decrypted);
    } catch (error) {
      console.error('Decryption failed:', error);
      throw new Error('Failed to decrypt data');
    }
  }

  static generateSecureSessionId(): string {
    if (!window.crypto || !window.crypto.getRandomValues) {
      return `demo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    const array = new Uint8Array(32);
    window.crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  static clearEncryptionKey(): void {
    this.encryptionKey = null;
  }

  static async hashData(data: string): Promise<string> {
    if (!window.crypto || !window.crypto.subtle) {
      let hash = 0;
      for (let i = 0; i < data.length; i++) {
        const char = data.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash;
      }
      return hash.toString(16);
    }

    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(byte => byte.toString(16).padStart(2, '0')).join('');
  }

  static maskSensitiveData(data: string): string {
    if (!data || data.length < 10) return '***';
    return `${data.substring(0, 6)}...${data.substring(data.length - 4)}`;
  }

  static isValidEVMAddress(address: string): boolean {
    return isAddress(address);
  }

  static isValidEVMPrivateKey(key: string): boolean {
    return /^0x[a-fA-F0-9]{64}$/.test(key);
  }

  static validateWalletData(wallet: any): boolean {
    if (!wallet || typeof wallet !== 'object') {
      console.error('Invalid wallet data structure');
      return false;
    }

    const { evmAddress, evmPrivateKey } = wallet;

    if (!this.isValidEVMAddress(evmAddress)) {
      console.error('Invalid EVM address format');
      return false;
    }

    if (!this.isValidEVMPrivateKey(evmPrivateKey)) {
      console.error('Invalid EVM private key format');
      return false;
    }

    if (!StellarValidator.validateStellarData(wallet)) {
      return false;
    }

    return true;
  }

  static isSecureContext(): boolean {
    if (typeof window === 'undefined') return true;
    if (['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)) {
      return true;
    }

    return window.isSecureContext;
  }

  static isWebCryptoAvailable(): boolean {
    return (
      typeof window !== 'undefined' &&
      'crypto' in window &&
      'subtle' in window.crypto &&
      this.isSecureContext()
    );
  }

  static initializeSecurity(): {
    isSecure: boolean;
    webCryptoAvailable: boolean;
    warnings: string[];
  } {
    const warnings: string[] = [];
    const isSecure = this.isSecureContext();
    const webCryptoAvailable = this.isWebCryptoAvailable();

    if (!isSecure) {
      warnings.push('Not running in secure context (HTTPS required for production)');
    }

    if (!webCryptoAvailable) {
      warnings.push('Web Crypto API not available - using fallback encryption');
    }

    if (warnings.length > 0) {
      warnings.forEach(warning => console.warn(warning));
    }

    return {
      isSecure,
      webCryptoAvailable,
      warnings,
    };
  }

  static createSecureSession(duration: number = 15 * 60 * 1000): {
    id: string;
    expiresAt: number;
    isValid: () => boolean;
    refresh: () => void;
  } {
    const id = this.generateSecureSessionId();
    let expiresAt = Date.now() + duration;

    return {
      id,
      expiresAt,
      isValid: () => Date.now() < expiresAt,
      refresh: () => {
        expiresAt = Date.now() + duration;
      },
    };
  }

  static secureWipe(
    obj: any,
    sensitiveKeys: string[] = ['privateKey', 'private', 'secret', 'mnemonic']
  ): void {
    if (!obj || typeof obj !== 'object') return;

    Object.keys(obj).forEach(key => {
      const lowerKey = key.toLowerCase();
      if (sensitiveKeys.some(sensitive => lowerKey.includes(sensitive))) {
        if (typeof obj[key] === 'string' && obj[key].length > 0) {
          obj[key] = Array(obj[key].length)
            .fill(0)
            .map(() => Math.random().toString(36).charAt(0))
            .join('');
        }
        obj[key] = null;
        delete obj[key];
      }
    });
  }

  private static sensitiveStorage = new Map<string, any>();

  static storeSensitiveData(key: string, data: any): void {
    this.sensitiveStorage.set(key, data);
  }

  static getSensitiveData(key: string): any {
    return this.sensitiveStorage.get(key);
  }

  static removeSensitiveData(key: string): void {
    const data = this.sensitiveStorage.get(key);
    if (data && typeof data === 'object') {
      this.secureWipe(data);
    }
    this.sensitiveStorage.delete(key);
  }

  static clearAllSensitiveData(): void {
    this.sensitiveStorage.clear();
    this.clearEncryptionKey();
  }
}

if (typeof window !== 'undefined') {
  SecurityUtils.initializeSecurity();

  window.addEventListener('beforeunload', () => {
    SecurityUtils.clearAllSensitiveData();
  });
}
