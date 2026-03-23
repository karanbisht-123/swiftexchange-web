import { BECH32_PREFIX, LocalWallet } from '@dydxprotocol/v4-client-js';

import { destroyAESKey, generateAndStoreAESKey, retrieveAESKey } from './keyVaultIndexedDB';
import { sessionVault } from './sessionVault';

const BLOB_KEY = '_sx_dkm_0xa7e3';
const ADDR_KEY = '_sx_dkm_addr';

function toBase64(buffer: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < buffer.length; i++) {
    binary += String.fromCharCode(buffer[i]);
  }
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function encryptBytes(
  plainBytes: Uint8Array,
  aesKey: CryptoKey
): Promise<{ ciphertext: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    new Uint8Array(plainBytes) as unknown as BufferSource
  );
  return {
    ciphertext: toBase64(new Uint8Array(encrypted)),
    iv: toBase64(iv),
  };
}

async function decryptBytes(
  ciphertext: string,
  iv: string,
  aesKey: CryptoKey
): Promise<Uint8Array> {
  const cipherBuf = fromBase64(ciphertext);
  const ivBuf = fromBase64(iv);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(ivBuf) as unknown as BufferSource },
    aesKey,
    new Uint8Array(cipherBuf) as unknown as BufferSource
  );
  const result = new Uint8Array(decrypted);
  cipherBuf.fill(0);
  ivBuf.fill(0);
  return result;
}

export async function encryptAndStore(mnemonic: string): Promise<string> {
  let aesKey = await retrieveAESKey();
  if (!aesKey) {
    aesKey = await generateAndStoreAESKey();
  }

  const encoder = new TextEncoder();
  const mnemonicBytes = encoder.encode(mnemonic);

  const wallet = await LocalWallet.fromMnemonic(mnemonic, BECH32_PREFIX);
  const address = wallet.address || '';

  sessionVault.store(wallet);

  const blob = await encryptBytes(mnemonicBytes, aesKey);
  mnemonicBytes.fill(0);

  localStorage.setItem(BLOB_KEY, JSON.stringify(blob));
  localStorage.setItem(ADDR_KEY, address);

  return address;
}

export async function decryptAndRestore(): Promise<boolean> {
  const raw = localStorage.getItem(BLOB_KEY);
  if (!raw) return false;

  const aesKey = await retrieveAESKey();
  if (!aesKey) {
    localStorage.removeItem(BLOB_KEY);
    localStorage.removeItem(ADDR_KEY);
    return false;
  }

  let parsed: { ciphertext: string; iv: string };
  try {
    parsed = JSON.parse(raw);
  } catch {
    localStorage.removeItem(BLOB_KEY);
    localStorage.removeItem(ADDR_KEY);
    return false;
  }

  let decryptedBytes: Uint8Array | null = null;
  try {
    decryptedBytes = await decryptBytes(parsed.ciphertext, parsed.iv, aesKey);
    const decoder = new TextDecoder();
    const mnemonic = decoder.decode(decryptedBytes);

    const wallet = await LocalWallet.fromMnemonic(mnemonic, BECH32_PREFIX);
    sessionVault.store(wallet);

    decryptedBytes.fill(0);
    return true;
  } catch {
    if (decryptedBytes) decryptedBytes.fill(0);
    localStorage.removeItem(BLOB_KEY);
    localStorage.removeItem(ADDR_KEY);
    return false;
  }
}

export function getStoredAddress(): string | null {
  return localStorage.getItem(ADDR_KEY);
}

export function hasEncryptedBlob(): boolean {
  return !!localStorage.getItem(BLOB_KEY);
}

export async function purge(): Promise<void> {
  sessionVault.clear();
  await destroyAESKey();
  localStorage.removeItem(BLOB_KEY);
  localStorage.removeItem(ADDR_KEY);
}
