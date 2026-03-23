const STORAGE_KEY = 'swiftex_local_transactions';
const MAX_TRANSACTIONS = 30;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type TransactionType = 'swap' | 'send' | 'bridge' | 'approval';

export interface LocalTransaction {
  hash: string;
  chainId: number;
  type: TransactionType;
  timestamp: number;
  description?: string;
}

export const getLocalTransactions = (): LocalTransaction[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];

    const transactions: LocalTransaction[] = JSON.parse(stored);
    const now = Date.now();
    const validTransactions = transactions.filter(tx => now - tx.timestamp < MAX_AGE_MS);
    if (validTransactions.length !== transactions.length) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(validTransactions));
    }

    return validTransactions;
  } catch (error) {
    console.error('Failed to get local transactions:', error);
    return [];
  }
};

export const addLocalTransaction = (tx: LocalTransaction): void => {
  try {
    const transactions = getLocalTransactions();
    if (transactions.some(t => t.hash.toLowerCase() === tx.hash.toLowerCase())) {
      return;
    }
    transactions.unshift(tx);
    const trimmed = transactions.slice(0, MAX_TRANSACTIONS);

    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch (error) {
    console.error('Failed to add local transaction:', error);
  }
};

export const removeLocalTransaction = (hash: string): void => {
  try {
    const transactions = getLocalTransactions();
    const filtered = transactions.filter(tx => tx.hash.toLowerCase() !== hash.toLowerCase());
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error('Failed to remove local transaction:', error);
  }
};

export const clearLocalTransactions = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear local transactions:', error);
  }
};

export const getTransactionsByChain = (chainId: number): LocalTransaction[] => {
  return getLocalTransactions().filter(tx => tx.chainId === chainId);
};
