import { Check } from 'lucide-react';
import React, { useState } from 'react';

import { changeMarginType } from '../../adapters/aster/api/account';
import { useAsterAgent } from '../../adapters/aster/hooks/useAsterAgent';
import { useMarketStore } from '../../core/stores/marketStore';
import { useOrderEntryStore } from '../../core/stores/orderEntryStore';
import { Modal } from '../ui/Modal';

interface MarginModeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MarginModeModal: React.FC<MarginModeModalProps> = ({ isOpen, onClose }) => {
  const store = useOrderEntryStore();
  const selectedSymbol = useMarketStore(state => state.selectedSymbol);
  const { asterSigner, userAddr } = useAsterAgent();

  const [selectedMode, setSelectedMode] = useState<'cross' | 'isolated'>(store.marginType);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleConfirm = async () => {
    if (selectedMode === store.marginType) {
      onClose();
      return;
    }

    if (!asterSigner || !userAddr) {
      store.setMarginType(selectedMode);
      onClose();
      return;
    }

    setIsSubmitting(true);
    try {
      await changeMarginType(
        asterSigner,
        userAddr,
        selectedSymbol.replace('-', ''),
        selectedMode.toUpperCase() as 'ISOLATED' | 'CROSSED'
      );
      store.setMarginType(selectedMode);
      onClose();
    } catch (err) {
      console.error('Failed to change margin type:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${selectedSymbol} Margin mode`}
      width="w-[400px]"
    >
      <div className="space-y-4">
        <p className="text-secondary text-[12px]">
          Switching of margin mode only applies to the selected contract
        </p>

        <div className="flex gap-4">
          <button
            onClick={() => setSelectedMode('cross')}
            className={`flex-1 py-3 rounded-xl border relative font-medium text-[13px] transition-colors
              ${
                selectedMode === 'cross'
                  ? 'border-brand bg-brand/10 text-brand'
                  : 'border-gray-200 bg-secondary text-primary '
              }`}
          >
            Cross
            {selectedMode === 'cross' && (
              <div className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-brand text-white rounded-full flex items-center justify-center ">
                <Check size={10} strokeWidth={4} />
              </div>
            )}
          </button>

          <button
            onClick={() => setSelectedMode('isolated')}
            className={`flex-1 py-3 rounded-xl border relative font-medium text-[13px] transition-colors
              ${
                selectedMode === 'isolated'
                  ? 'border-brand bg-brand/10 text-brand'
                  : 'border-gray-200 bg-secondary text-primary '
              }`}
          >
            Isolated
            {selectedMode === 'isolated' && (
              <div className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-brand rounded-full flex items-center justify-center text-white">
                <Check size={10} strokeWidth={4} />
              </div>
            )}
          </button>
        </div>

        <div className="bg-primary p-4 rounded-xl space-y-2 mt-2">
          <h4 className="text-primary text-[12px] font-semibold">
            What are cross and isolated modes?
          </h4>
          <p className="text-secondary text-[11px] leading-relaxed">
            The Margin assigned to a position is restricted to a certain amount. If the Margin falls
            below the Maintenance Margin level, the position is liquidated. However, you can add and
            remove Margin at will under this mode.
          </p>
        </div>

        <button
          onClick={handleConfirm}
          disabled={isSubmitting}
          className="w-full mt-4 bg-brand hover:bg-brand-hover text-white font-semibold py-2.5 rounded-lg transition-colors disabled:opacity-50 cursor-pointer text-[13px]"
        >
          {isSubmitting ? 'Confirming...' : 'Confirm'}
        </button>
      </div>
    </Modal>
  );
};
