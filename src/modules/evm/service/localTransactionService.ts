const STORAGE_KEY = 'swiftex_local_transactions';
const MAX_TRANSACTIONS = 30;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type TransactionType = 'swap' | 'send' | 'bridge' | 'approval' | 'trustline' | 'claim' | 'orderbook' | 'crosschain-swap';

export interface LocalTransaction {
  hash: string;
  chainId: number | string;
  type: TransactionType;
  timestamp: number;
  description?: string;
  status?: 'pending' | 'success' | 'failed';
  blockNumber?: number;
  gasUsed?: string;
  destinationHash?: string;
  from?: string;
  to?: string;
  network?: string;
  provider?: string;
}

export const getLocalTransactions = (walletAddresses?: string[], network?: string): LocalTransaction[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];

    let transactions: LocalTransaction[] = JSON.parse(stored);
    const now = Date.now();

    const validTransactions = transactions.filter(tx => {
      const isExpired = now - tx.timestamp >= MAX_AGE_MS;
      if (isExpired) return false;

      const isStellar = tx.chainId === 'stellar' || tx.chainId === 'pubnet' || tx.chainId === 'testnet';
      if (isStellar && tx.type !== 'bridge' && tx.type !== 'crosschain-swap') {
        return false;
      }
      return true;
    });

    let filteredTransactions = validTransactions;
    if (walletAddresses && walletAddresses.length > 0) {
      const lowerAddresses = walletAddresses.map(addr => addr.toLowerCase());
      filteredTransactions = filteredTransactions.filter(tx => {
        const isStellarTx =
          tx.chainId === 'pubnet' ||
          tx.chainId === 'testnet' ||
          tx.chainId === 'stellar' ||
          (tx.from && tx.from.toUpperCase().startsWith('G') && tx.from.length === 56);

        if (isStellarTx) {
          return true;
        }

        return tx.from && lowerAddresses.includes(tx.from.toLowerCase());
      });
    }
    if (network) {
      filteredTransactions = filteredTransactions.filter(
        tx => tx.network === network
      );
    }

    if (validTransactions.length !== transactions.length) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(validTransactions));
    }

    return filteredTransactions;
  } catch (error) {
    console.error('Failed to get local transactions:', error);
    return [];
  }
};

export const addLocalTransaction = (tx: LocalTransaction): void => {
  try {
    const isStellar = tx.chainId === 'stellar' || tx.chainId === 'pubnet' || tx.chainId === 'testnet';
    if (isStellar && tx.type !== 'bridge' && tx.type !== 'crosschain-swap') {
      return;
    }

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

export const updateLocalTransactionStatus = (
  hash: string,
  status: 'pending' | 'success' | 'failed',
  blockNumber?: number,
  gasUsed?: string,
  destinationHash?: string,
  from?: string,
  to?: string
): void => {
  try {
    const transactions = getLocalTransactions();
    const index = transactions.findIndex(tx => tx.hash.toLowerCase() === hash.toLowerCase());
    if (index !== -1) {
      transactions[index] = {
        ...transactions[index],
        status,
        blockNumber: blockNumber ?? transactions[index].blockNumber,
        gasUsed: gasUsed ?? transactions[index].gasUsed,
        destinationHash: destinationHash ?? transactions[index].destinationHash,
        from: from ?? transactions[index].from,
        to: to ?? transactions[index].to,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
    }
  } catch (error) {
    console.error('Failed to update local transaction status:', error);
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

export const getTransactionsByChain = (chainId: number | string): LocalTransaction[] => {
  return getLocalTransactions().filter(tx => tx.chainId === chainId);
};


