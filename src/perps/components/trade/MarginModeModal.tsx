import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { useOrderEntryStore } from '../../core/stores/orderEntryStore';
import { changeMarginType } from '../../adapters/aster/api/account';
import { useAsterAgent } from '../../adapters/aster/hooks/useAsterAgent';
import { useMarketStore } from '../../core/stores/marketStore';
import { Check } from 'lucide-react';

interface MarginModeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MarginModeModal: React.FC<MarginModeModalProps> = ({ isOpen, onClose }) => {
  const store = useOrderEntryStore();
  const selectedSymbol = useMarketStore((state) => state.selectedSymbol);
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
    <Modal isOpen={isOpen} onClose={onClose} title={`${selectedSymbol} Margin mode`} width="w-[400px]">
      <div className="space-y-4">
        <p className="text-secondary text-[12px]">
          Switching of margin mode only applies to the selected contract
        </p>

        <div className="flex gap-4">
          <button
            onClick={() => setSelectedMode('cross')}
            className={`flex-1 py-3 rounded-xl border relative font-medium text-[13px] transition-colors
              ${selectedMode === 'cross' 
                ? 'border-[#E0A865] bg-[#E0A865]/10 text-[#E0A865]' 
                : 'border-[#2B2B2B] bg-[#222222] text-primary hover:border-[#444]'
              }`}
          >
            Cross
            {selectedMode === 'cross' && (
              <div className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-[#E0A865] rounded-full flex items-center justify-center text-black">
                <Check size={10} strokeWidth={4} />
              </div>
            )}
          </button>
          
          <button
            onClick={() => setSelectedMode('isolated')}
            className={`flex-1 py-3 rounded-xl border relative font-medium text-[13px] transition-colors
              ${selectedMode === 'isolated' 
                ? 'border-[#E0A865] bg-[#E0A865]/10 text-[#E0A865]' 
                : 'border-[#2B2B2B] bg-[#222222] text-primary hover:border-[#444]'
              }`}
          >
            Isolated
            {selectedMode === 'isolated' && (
              <div className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-[#E0A865] rounded-full flex items-center justify-center text-black">
                <Check size={10} strokeWidth={4} />
              </div>
            )}
          </button>
        </div>

        <div className="bg-[#111111] p-4 rounded-xl space-y-2 mt-2">
          <h4 className="text-primary text-[12px] font-semibold">What are cross and isolated modes?</h4>
          <p className="text-secondary text-[11px] leading-relaxed">
            The Margin assigned to a position is restricted to a certain amount. If the Margin falls below the Maintenance Margin level, the position is liquidated. However, you can add and remove Margin at will under this mode.
          </p>
        </div>

        <button 
          onClick={handleConfirm}
          disabled={isSubmitting}
          className="w-full mt-4 bg-gradient-to-r from-[#EBD197] to-[#B48348] hover:opacity-90 text-black font-semibold py-3 rounded-xl transition-opacity disabled:opacity-50"
        >
          {isSubmitting ? 'Confirming...' : 'Confirm'}
        </button>
      </div>
    </Modal>
  );
};
