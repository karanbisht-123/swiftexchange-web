const STORAGE_KEY = 'swiftex_near_intent_txs';
const MAX_TRANSACTIONS = 50;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type NearIntentTxStatus = 'pending' | 'completed' | 'failed' | 'refunded';

export interface NearIntentTransaction {
  txHash: string;
  depositAddress: string;
  depositMemo?: string;
  amountIn: string;
  sellSymbol: string;
  buySymbol: string;
  fromChainId: number | string;
  toChainId: number | string;
  walletAddress: string;
  status: NearIntentTxStatus;
  quoteHash?: string;
  amountOut?: string;
  timestamp: number;
  network: string;
}

const readAll = (): NearIntentTransaction[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const txs: NearIntentTransaction[] = JSON.parse(raw);
    const now = Date.now();
    return txs.filter(tx => now - tx.timestamp < MAX_AGE_MS);
  } catch {
    return [];
  }
};

const writeAll = (txs: NearIntentTransaction[]): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(txs.slice(0, MAX_TRANSACTIONS)));
  } catch {
    // storage quota exceeded — fail silently
  }
};

export const addNearIntentTransaction = (tx: NearIntentTransaction): void => {
  const existing = readAll();
  if (existing.some(t => t.txHash.toLowerCase() === tx.txHash.toLowerCase())) return;
  writeAll([tx, ...existing]);
};

export const getNearIntentTransactions = (
  walletAddresses?: string[],
  network?: string
): NearIntentTransaction[] => {
  let txs = readAll();
  if (network) {
    txs = txs.filter(tx => tx.network === network);
  }
  if (walletAddresses && walletAddresses.length > 0) {
    const lower = walletAddresses.map(a => a.toLowerCase());
    txs = txs.filter(tx => lower.includes(tx.walletAddress.toLowerCase()));
  }
  return txs;
};

export const updateNearIntentTxStatus = (
  txHash: string,
  status: NearIntentTxStatus,
  amountOut?: string
): void => {
  const txs = readAll();
  const idx = txs.findIndex(t => t.txHash.toLowerCase() === txHash.toLowerCase());
  if (idx === -1) return;
  txs[idx] = {
    ...txs[idx],
    status,
    ...(amountOut !== undefined ? { amountOut } : {}),
  };
  writeAll(txs);
};

export const removeNearIntentTransaction = (txHash: string): void => {
  const txs = readAll().filter(t => t.txHash.toLowerCase() !== txHash.toLowerCase());
  writeAll(txs);
};

export const getPendingNearIntentTransactions = (
  walletAddresses?: string[],
  network?: string
): NearIntentTransaction[] =>
  getNearIntentTransactions(walletAddresses, network).filter(tx => tx.status === 'pending');
