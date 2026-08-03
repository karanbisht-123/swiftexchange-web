import React, { useState, useEffect } from 'react';
import { Modal } from '../ui/Modal';
import { useAccountStore } from '../../core/stores/accountStore';
import { useAsterAgent } from '../../adapters/aster/hooks/useAsterAgent';
import { changeMultiAssetsMargin } from '../../adapters/aster/api/account';

interface AssetModeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AssetModeModal: React.FC<AssetModeModalProps> = ({ isOpen, onClose }) => {
  const multiAssetsMargin = useAccountStore((state) => state.multiAssetsMargin);
  const setMultiAssetsMargin = useAccountStore((state) => state.setMultiAssetsMargin);
  const getBalance = useAccountStore((state) => state.getBalance);
  const { asterSigner, userAddr } = useAsterAgent();
  
  const [selectedMode, setSelectedMode] = useState<'single' | 'multi'>(multiAssetsMargin ? 'multi' : 'single');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setSelectedMode(multiAssetsMargin ? 'multi' : 'single');
      setError('');
    }
  }, [isOpen, multiAssetsMargin]);

  const handleConfirm = async () => {
    if ((selectedMode === 'multi') === multiAssetsMargin) {
      onClose();
      return;
    }

    // Safety Check: Ensure USDT balance is not negative before switching modes
    const usdtBalance = getBalance('USDT');
    const usdtTotal = usdtBalance ? parseFloat(usdtBalance.total) : 0;
    
    if (usdtTotal < 0) {
      setError('Cannot change Asset Mode while USDT balance is negative.');
      return;
    }

    if (!asterSigner || !userAddr) {
      // Offline fallback
      setMultiAssetsMargin(selectedMode === 'multi');
      onClose();
      return;
    }

    setIsSubmitting(true);
    setError('');
    try {
      await changeMultiAssetsMargin(asterSigner, userAddr, selectedMode === 'multi');
      setMultiAssetsMargin(selectedMode === 'multi');
      onClose();
    } catch (err: any) {
      console.error('Failed to change asset mode:', err);
      setError(err.message || 'Failed to change asset mode. Make sure you have no open orders or positions.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Asset Mode">
      <div className="space-y-4">
        
        {/* Single-Asset Mode Option */}
        <div 
          onClick={() => setSelectedMode('single')}
          className={`p-4 rounded-xl border cursor-pointer transition-colors ${selectedMode === 'single' ? 'border-brand bg-brand/5' : 'border-color hover:border-color-hover bg-secondary'}`}
        >
          <div className="flex items-start gap-3">
            <div className={`mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${selectedMode === 'single' ? 'border-brand' : 'border-muted'}`}>
              {selectedMode === 'single' && <div className="w-2 h-2 rounded-full bg-brand" />}
            </div>
            <div>
              <div className={`font-semibold text-[13px] ${selectedMode === 'single' ? 'text-primary' : 'text-secondary'}`}>Single-Asset Mode</div>
              <ul className="text-[11px] text-muted mt-2 space-y-1.5 list-disc pl-3">
                <li>Use pair's settlement currency as margin.</li>
                <li>PnL offsets across Cross positions of the same currency.</li>
                <li>Supports Cross and Isolated margin.</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Multi-Asset Mode Option */}
        <div 
          onClick={() => setSelectedMode('multi')}
          className={`p-4 rounded-xl border cursor-pointer transition-colors ${selectedMode === 'multi' ? 'border-brand bg-brand/5' : 'border-color hover:border-color-hover bg-secondary'}`}
        >
          <div className="flex items-start gap-3">
            <div className={`mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${selectedMode === 'multi' ? 'border-brand' : 'border-muted'}`}>
              {selectedMode === 'multi' && <div className="w-2 h-2 rounded-full bg-brand" />}
            </div>
            <div>
              <div className={`font-semibold text-[13px] ${selectedMode === 'multi' ? 'text-primary' : 'text-secondary'}`}>Multi-Asset Mode</div>
              <ul className="text-[11px] text-muted mt-2 space-y-1.5 list-disc pl-3">
                <li>Contracts can be traded across margin assets.</li>
                <li>The profits and losses of positions with different margin assets can offset one another.</li>
                <li>Supports cross margin.</li>
              </ul>
            </div>
          </div>
        </div>

        {error && (
          <div className="text-danger text-[11px] font-medium px-1">
            {error}
          </div>
        )}

        <button
          onClick={handleConfirm}
          disabled={isSubmitting || (selectedMode === 'multi') === multiAssetsMargin}
          className="w-full bg-brand text-[#0b0e14] py-3 rounded-lg font-bold text-[13px] hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed mt-2"
        >
          {isSubmitting ? 'Confirming...' : 'Confirm'}
        </button>
      </div>
    </Modal>
  );
};
