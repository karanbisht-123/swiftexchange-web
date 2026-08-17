import { Wallet, getAddress, verifyTypedData } from 'ethers';

import { ASTER_REST_URL } from '../../../perps/adapters/aster/constants';
import { destroyAESKey, generateAndStoreAESKey, retrieveAESKey } from './keyVaultIndexedDB';

const BLOB_KEY = '_sx_aster_agentkey';
const ADDR_KEY = '_sx_aster_agentaddr';
const AGENT_NAME = '@swiftex-desktop';

function getAsterAgentDomain(chainId: number) {
  return {
    name: 'AsterSignTransaction',
    version: '1',
    chainId: chainId,
    verifyingContract: '0x0000000000000000000000000000000000000000',
  };
}

const APPROVE_AGENT_TYPES = {
  ApproveAgent: [
    { name: 'AgentName', type: 'string' },
    { name: 'AgentAddress', type: 'string' },
    { name: 'Expired', type: 'uint256' },
    { name: 'CanSpotTrade', type: 'bool' },
    { name: 'CanPerpTrade', type: 'bool' },
    { name: 'CanWithdraw', type: 'bool' },
    { name: 'AsterChain', type: 'string' },
    { name: 'User', type: 'string' },
    { name: 'Nonce', type: 'uint256' },
  ],
};

function buildApproveAgentData(
  evmAddress: string,
  agentAddress: string,
  nonce: number,
  expired: number,
  chainId: number
) {
  return {
    domain: getAsterAgentDomain(chainId),
    primaryType: 'ApproveAgent' as const,
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
      ...APPROVE_AGENT_TYPES,
    },
    message: {
      AgentName: AGENT_NAME,
      AgentAddress: agentAddress,
      Expired: expired,
      CanSpotTrade: true,
      CanPerpTrade: true,
      CanWithdraw: false,
      AsterChain: 'Mainnet',
      User: getAddress(evmAddress),
      Nonce: nonce,
    },
  };
}

export interface AsterAgentKey {
  agentAddress: string;
  wallet: Wallet;
}

function toBase64(buf: Uint8Array): string {
  let b = '';
  for (let i = 0; i < buf.length; i++) b += String.fromCharCode(buf[i]);
  return btoa(b);
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function encryptBytes(
  plain: Uint8Array,
  aesKey: CryptoKey
): Promise<{ ciphertext: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    plain as unknown as BufferSource
  );
  return { ciphertext: toBase64(new Uint8Array(encrypted)), iv: toBase64(iv) };
}

async function decryptBytes(
  ciphertext: string,
  iv: string,
  aesKey: CryptoKey
): Promise<Uint8Array> {
  const cipherBuf = fromBase64(ciphertext);
  const ivBuf = fromBase64(iv);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBuf as unknown as BufferSource },
    aesKey,
    cipherBuf as unknown as BufferSource
  );
  const result = new Uint8Array(decrypted);
  cipherBuf.fill(0);
  ivBuf.fill(0);
  return result;
}

function assertWellFormedSignature(signature: string) {
  if (!/^0x[0-9a-fA-F]{130}$/.test(signature)) {
    throw new Error(
      `Malformed signature returned by wallet provider: expected 0x + 130 hex chars (65 bytes), got "${signature}" (length ${signature.length}). This points to a bug in the wallet's eth_signTypedData_v4 implementation, not in the payload.`
    );
  }
}

export async function submitApproveAgent(params: {
  user: string;
  nonce: string;
  signature: string;
  agentName: string;
  agentAddress: string;
  expired: string;
  signatureChainId: number;
  canSpotTrade: boolean;
  canPerpTrade: boolean;
  canWithdraw: boolean;
}) {
  const rawParams = [
    `agentName=${params.agentName}`,
    `agentAddress=${getAddress(params.agentAddress)}`,
    `expired=${params.expired}`,
    `canSpotTrade=${params.canSpotTrade.toString()}`,
    `canPerpTrade=${params.canPerpTrade.toString()}`,
    `canWithdraw=${params.canWithdraw.toString()}`,
    `asterChain=Mainnet`,
    `user=${getAddress(params.user)}`,
    `nonce=${params.nonce}`,
    `signature=${params.signature}`,
    `signatureChainId=${params.signatureChainId}`,
  ];

  const queryString = rawParams.join('&');
  const url = `${ASTER_REST_URL}/fapi/v3/approveAgent?${queryString}`;

  console.groupCollapsed('[aster] submitApproveAgent → request');
  console.log('url:', url);
  console.groupEnd();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: '',
      signal: controller.signal,
    });
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error(
        'Connection timed out while contacting Aster API. Please check your internet connection.'
      );
    }
    console.warn(`Fetch to ${url} failed`, error);
    throw new Error(error?.message || 'Network error connecting to Aster API');
  } finally {
    clearTimeout(timeoutId);
  }

  const data = await res.json();

  console.groupCollapsed('[aster] submitApproveAgent → response');
  console.log('status:', res.status, res.statusText);
  console.log('data:', data);
  console.groupEnd();

  if (data.code !== 200) {
    throw new Error(
      `Aster API approval failed: ${data.msg || 'Unknown error'} (code: ${data.code})`
    );
  }
}

async function signTypedData(
  provider: any,
  evmAddress: string,
  typedData: object
): Promise<string> {
  const isWalletConnect = !!provider?.session;
  const payload = isWalletConnect ? typedData : JSON.stringify(typedData);

  try {
    const token = localStorage.getItem('device_token');
    if (token) {
      const { sendCustomNotification } = await import('../../../service/notificationService');
      sendCustomNotification(token, {
        title: 'Signature Request',
        body: 'Please open your wallet to sign the Aster onboarding message.',
      }).catch(err => console.error(err));
    }
  } catch {
    // ignore
  }

  try {
    return await provider.request({
      method: 'eth_signTypedData_v4',
      params: [evmAddress, payload],
    });
  } catch (err: any) {
    if (err?.message === 'USER_REJECTED') {
      throw new Error('Signature rejected by user');
    }
    const isUnknownMethod =
      err?.code === 4200 ||
      err?.code === -32601 ||
      /unknown method|not supported/i.test(err?.message ?? '');
    if (!isUnknownMethod) throw err;

    try {
      return await provider.request({
        method: 'eth_signTypedData',
        params: [evmAddress, payload],
      });
    } catch (fallbackErr: any) {
      if (fallbackErr?.message === 'USER_REJECTED') {
        throw new Error('Signature rejected by user');
      }
      throw fallbackErr;
    }
  }
}

export async function deriveAsterAgentKey(
  evmAddress: string,
  provider: any
): Promise<{
  agentAddress: string;
  wallet: Wallet;
  signature: string;
  nonce: string;
  expired: string;
}> {
  let chainId = 56;

  try {
    const hexChainId = await provider.request({ method: 'eth_chainId' });
    chainId = parseInt(hexChainId, 16);
    console.log(`[aster] Dynamically fetched active chainId from wallet: ${chainId}`);
  } catch (err) {
    console.warn('[aster] Failed to fetch active eth_chainId, falling back to 56', err);
  }

  const agentWallet = new Wallet(Wallet.createRandom().privateKey);

  const nonce = Date.now() * 1000;
  const expired = Date.now() + 30 * 24 * 60 * 60 * 1000;

  const typedData = buildApproveAgentData(evmAddress, agentWallet.address, nonce, expired, chainId);

  console.groupCollapsed('[aster] deriveAsterAgentKey → signing payload');
  console.log('evmAddress (signer):', evmAddress);
  console.log('agentWallet.address:', agentWallet.address);
  console.log('domain:', typedData.domain);
  console.log('primaryType:', typedData.primaryType);
  console.log('types.ApproveAgent:', typedData.types.ApproveAgent);
  console.log('message:', typedData.message);
  console.log('raw JSON sent to eth_signTypedData_v4:', JSON.stringify(typedData));
  console.groupEnd();

  const signature = await signTypedData(provider, evmAddress, typedData);

  console.log('[aster] signature returned by wallet:', signature, `(length ${signature.length})`);

  assertWellFormedSignature(signature);

  const recovered = verifyTypedData(
    typedData.domain,
    APPROVE_AGENT_TYPES,
    typedData.message,
    signature
  );

  console.log('[aster] locally recovered signer:', recovered, '— expected:', evmAddress);

  if (getAddress(recovered) !== getAddress(evmAddress)) {
    throw new Error(
      `Local signature verification failed: expected signer ${evmAddress}, recovered ${recovered}. ` +
        `The signature does not match (domain, types, message) — check that the wallet actually signed exactly this payload.`
    );
  }

  await submitApproveAgent({
    user: evmAddress,
    nonce: nonce.toString(),
    signature,
    agentName: AGENT_NAME,
    agentAddress: agentWallet.address,
    expired: expired.toString(),
    signatureChainId: chainId,
    canSpotTrade: true,
    canPerpTrade: true,
    canWithdraw: false,
  });

  return {
    agentAddress: agentWallet.address,
    wallet: agentWallet,
    signature,
    nonce: nonce.toString(),
    expired: expired.toString(),
  };
}

export async function encryptAndStoreAgentKey(privKeyHex: string): Promise<string> {
  let aesKey = await retrieveAESKey();
  if (!aesKey) aesKey = await generateAndStoreAESKey();

  const agentWallet = new Wallet(privKeyHex);
  const encoder = new TextEncoder();
  const keyBytes = encoder.encode(privKeyHex);

  const blob = await encryptBytes(keyBytes, aesKey);
  keyBytes.fill(0);

  localStorage.setItem(BLOB_KEY, JSON.stringify(blob));
  localStorage.setItem(ADDR_KEY, agentWallet.address);

  return agentWallet.address;
}

export async function restoreAgentWallet(): Promise<Wallet | null> {
  const raw = localStorage.getItem(BLOB_KEY);
  if (!raw) return null;

  const aesKey = await retrieveAESKey();
  if (!aesKey) {
    purgeAgentKey();
    return null;
  }

  let parsed: { ciphertext: string; iv: string };
  try {
    parsed = JSON.parse(raw);
  } catch {
    purgeAgentKey();
    return null;
  }

  let keyBytes: Uint8Array | null = null;
  try {
    keyBytes = await decryptBytes(parsed.ciphertext, parsed.iv, aesKey);
    const privKeyHex = new TextDecoder().decode(keyBytes);
    keyBytes.fill(0);
    return new Wallet(privKeyHex);
  } catch {
    if (keyBytes) keyBytes.fill(0);
    purgeAgentKey();
    return null;
  }
}

export function getStoredAgentAddress(): string | null {
  return localStorage.getItem(ADDR_KEY);
}

export function hasStoredAgentKey(): boolean {
  return !!localStorage.getItem(BLOB_KEY);
}

export function purgeAgentKey(): void {
  localStorage.removeItem(BLOB_KEY);
  localStorage.removeItem(ADDR_KEY);
}

export async function purgeAgentKeyAndAes(): Promise<void> {
  purgeAgentKey();
  await destroyAESKey();
}
