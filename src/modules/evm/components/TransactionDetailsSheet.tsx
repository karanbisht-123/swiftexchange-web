import { X } from 'lucide-react';
import React from 'react';

import { type TransactionItem } from '../service/EvmTransactionService';
import TransactionDetailsView from './TransactionDetailsView';

interface TransactionDetailsSheetProps {
  transaction: TransactionItem;
  isOpen: boolean;
  onClose: () => void;
  network?: string;
}

const TransactionDetailsSheet: React.FC<TransactionDetailsSheetProps> = ({
  transaction,
  isOpen,
  onClose,
  network = 'ETH',
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end md:justify-center md:items-center">
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      <div className="relative w-full h-[85vh] md:max-w-lg bg-secondary rounded-t-2xl shadow-xl flex flex-col animate-in slide-in-from-bottom duration-300 md:hidden">
        <div className="flex items-center justify-between p-4 border-b border-color shrink-0">
          <h2 className="text-lg font-bold text-primary">Transaction Details</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-tertiary rounded-full transition-colors text-muted hover:text-primary"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-hidden p-4 bg-primary/50">
          <TransactionDetailsView transaction={transaction} network={network} />
        </div>
      </div>
    </div>
  );
};

export default TransactionDetailsSheet;
