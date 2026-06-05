import { create } from 'zustand';

export interface TransactionModalParams {
  status: 'success' | 'error';
  type: string; // e.g. 'Swap' | 'Bridge' | 'Send' | 'Order' | 'Trustline'
  hash?: string;
  error?: string;
  explorerUrl?: string;
  networkName?: string;
  isStellar?: boolean;
}

interface TransactionModalStore {
  isOpen: boolean;
  modalParams: TransactionModalParams | null;
  shownHashes: Set<string>;
  openModal: (params: TransactionModalParams) => void;
  closeModal: () => void;
  markAsShown: (hash: string) => void;
  hasBeenShown: (hash: string) => boolean;
}

export const useTransactionModalStore = create<TransactionModalStore>((set, get) => ({
  isOpen: false,
  modalParams: null,
  shownHashes: new Set<string>(),
  openModal: (params) => {
    if (params.hash) {
      const newShown = new Set(get().shownHashes);
      newShown.add(params.hash);
      set({ isOpen: true, modalParams: params, shownHashes: newShown });
    } else {
      set({ isOpen: true, modalParams: params });
    }
  },
  closeModal: () => set({ isOpen: false, modalParams: null }),
  markAsShown: (hash) => {
    const newShown = new Set(get().shownHashes);
    newShown.add(hash);
    set({ shownHashes: newShown });
  },
  hasBeenShown: (hash) => get().shownHashes.has(hash),
}));
