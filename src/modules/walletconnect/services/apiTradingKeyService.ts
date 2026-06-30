import {
  CompositeClient,
  tradingKeyUtils,
} from '@dydxprotocol/v4-client-js';
import { SubaccountInfo } from '@dydxprotocol/v4-client-js';

const { createNewRandomDydxWallet, getAuthorizeNewTradingKeyArguments } = tradingKeyUtils;

import { decryptAndRestore } from './dydxKeyManager';
import { generateAndStoreAESKey, retrieveAESKey } from './keyVaultIndexedDB';
import { sessionVault } from './sessionVault';

// Storage keys
export const API_KEYS_LIST_KEY = '_sx_dkm_api_keys';
export const API_KEY_BLOB_PREFIX = '_sx_dkm_apk_';
export const WITHDRAW_PREF_KEY = '_sx_withdraw_pref';

// Types
export interface ApiTradingKey {
  id: string;
  address: string;
  label: string;
  authenticatorId: string
  createdAt: string;
  revoked: boolean;
  scope: string[];
}

interface EncryptedBlob {
  ciphertext: string;
  iv: string;
}

function toBase64(buf: Uint8Array): string {
  let s = '';
  for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]);
  return btoa(s);
}


async function encryptMnemonic(
  mnemonic: string,
  aesKey: CryptoKey
): Promise<EncryptedBlob> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plainBytes = new TextEncoder().encode(mnemonic);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    plainBytes as unknown as BufferSource
  );
  plainBytes.fill(0);
  return { ciphertext: toBase64(new Uint8Array(encrypted)), iv: toBase64(iv) };
}

function generateUUID(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant bits
  const hex = Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function readList(): ApiTradingKey[] {
  try {
    const raw = localStorage.getItem(API_KEYS_LIST_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ApiTradingKey[];
  } catch {
    return [];
  }
}

function writeList(list: ApiTradingKey[]): void {
  localStorage.setItem(API_KEYS_LIST_KEY, JSON.stringify(list));
}

const RETRY_DELAYS_MS = [1500, 3000, 5000, 8000, 13000];

async function resolveNewAuthenticatorId(
  compositeClient: CompositeClient,
  ownerAddress: string,
  knownIdsBefore: Set<string>
): Promise<string> {
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) {
      await new Promise(r => setTimeout(r, RETRY_DELAYS_MS[attempt - 1]));
    }
    try {
      const { accountAuthenticators } =
        await compositeClient.getAuthenticators(ownerAddress);
      for (const auth of accountAuthenticators) {
        const idStr = auth.id.toString();
        if (!knownIdsBefore.has(idStr)) {
          return idStr;
        }
      }
    } catch (err) {
      console.warn(`[apiTradingKeyService] getAuthenticators attempt ${attempt + 1} failed:`, err);
    }
  }
  throw new Error(
    'Could not resolve on-chain authenticator ID after broadcast. ' +
    'The key was registered on-chain but its ID could not be confirmed. ' +
    'Please check your dYdX account authenticators and revoke manually if needed.'
  );
}

async function requireOwnerWallet() {
  let wallet = sessionVault.get();
  if (!wallet) {
    const restored = await decryptAndRestore();
    if (!restored) {
      throw new Error(
        'Owner wallet not available. Please re-connect and derive your dYdX wallet first.'
      );
    }
    wallet = sessionVault.get();
  }
  if (!wallet) {
    throw new Error('Owner wallet could not be loaded from vault.');
  }
  return wallet;
}

async function requireAESKey(): Promise<CryptoKey> {
  let key = await retrieveAESKey();
  if (!key) key = await generateAndStoreAESKey();
  return key;
}

export async function generateApiTradingKey(
  label: string | undefined,
  compositeClient: CompositeClient
): Promise<ApiTradingKey> {
  // Ensure owner wallet is in session vault
  const ownerWallet = await requireOwnerWallet();
  const ownerAddress = ownerWallet.address;
  if (!ownerAddress) throw new Error('Owner wallet has no address.');

  //Snapshot current authenticators (before broadcast)
  let knownIdsBefore: Set<string>;
  try {
    const { accountAuthenticators } =
      await compositeClient.getAuthenticators(ownerAddress);
    knownIdsBefore = new Set(accountAuthenticators.map(a => a.id.toString()));
  } catch {
    // If the account has no authenticators yet, treat as empty
    knownIdsBefore = new Set();
  }

  const generated = await createNewRandomDydxWallet();
  if (!generated) throw new Error('Failed to generate trading key wallet.');
  const { mnemonic, publicKey: publicKeyObj, address: tradingAddress } = generated;
  const pubKeyValue: string = (publicKeyObj as any).value ?? publicKeyObj;

  const { type: authType, data: authData } = getAuthorizeNewTradingKeyArguments({
    generatedWalletPubKey: pubKeyValue,
  });
  const ownerSubaccount = SubaccountInfo.forLocalWallet(ownerWallet, 0);
  await compositeClient.addAuthenticator(ownerSubaccount, authType, authData);
  const authenticatorId = await resolveNewAuthenticatorId(
    compositeClient,
    ownerAddress,
    knownIdsBefore
  );

  // Encrypt session mnemonic with the shared AES key
  const aesKey = await requireAESKey();
  const id = generateUUID();
  let mnemonicCopy = mnemonic;
  const blob = await encryptMnemonic(mnemonicCopy, aesKey);
  mnemonicCopy = '\x00'.repeat(mnemonic.length);
  localStorage.setItem(API_KEY_BLOB_PREFIX + id, JSON.stringify(blob));
  const existingList = readList();
  const keyMetadata: ApiTradingKey = {
    id,
    address: tradingAddress,
    label: label?.trim() || `API Key #${existingList.length + 1}`,
    authenticatorId,
    createdAt: new Date().toISOString(),
    revoked: false,
    scope: ['MsgPlaceOrder', 'MsgCancelOrder', 'MsgBatchCancelShortTermOrders'],
  };

  writeList([keyMetadata, ...existingList]);
  return keyMetadata;
}

//  Revoke an API trading key by removing its on-chain authenticator.

export async function revokeApiTradingKey(
  id: string,
  compositeClient: CompositeClient
): Promise<void> {
  const list = readList();
  const key = list.find(k => k.id === id);
  if (!key) throw new Error(`API trading key "${id}" not found in local storage.`);
  if (key.revoked) throw new Error(`API trading key "${id}" is already revoked.`);

  const ownerWallet = await requireOwnerWallet();
  const ownerSubaccount = SubaccountInfo.forLocalWallet(ownerWallet, 0);

  // MsgRemoveAuthenticator — only touches this key's authenticatorId
  await compositeClient.removeAuthenticator(ownerSubaccount, key.authenticatorId);

  // Mark revoked in local list — keep the row for audit trail
  const updated = list.map(k =>
    k.id === id ? { ...k, revoked: true } : k
  );
  writeList(updated);

  // Remove encrypted mnemonic blob (no longer needed)
  localStorage.removeItem(API_KEY_BLOB_PREFIX + id);
}

export function listApiTradingKeys(): ApiTradingKey[] {
  return readList();
}

/**
 * Wipe ALL api trading key data from local storage.
 * Called by walletService.clearAppData() on full disconnect.
 */
export function purgeApiTradingKeys(): void {
  const blobKeys = Object.keys(localStorage).filter(k =>
    k.startsWith(API_KEY_BLOB_PREFIX)
  );
  for (const k of blobKeys) localStorage.removeItem(k);
  localStorage.removeItem(API_KEYS_LIST_KEY);
}
