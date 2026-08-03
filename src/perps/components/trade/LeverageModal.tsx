import React, { useState, useEffect, useMemo } from 'react';
import { Modal } from '../ui/Modal';
import { useOrderEntryStore } from '../../core/stores/orderEntryStore';
import { changeLeverage } from '../../adapters/aster/api/account';
import { useAsterAgent } from '../../adapters/aster/hooks/useAsterAgent';
import { useMarketStore } from '../../core/stores/marketStore';
import { useLeverageStore, leverageStore } from '../../core/stores/leverageStore';
import { Minus, Plus } from 'lucide-react';

interface LeverageModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LeverageModal: React.FC<LeverageModalProps> = ({ isOpen, onClose }) => {
  const store = useOrderEntryStore();
  const selectedSymbol = useMarketStore((state) => state.selectedSymbol);
  const { asterSigner, userAddr } = useAsterAgent();
  
  const [leverage, setLeverage] = useState<number>(store.leverage);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const formattedSymbol = selectedSymbol.replace('-', '');
  const leverageBrackets = useLeverageStore(state => state.bracketsBySymbol[formattedSymbol]) || [];

  useEffect(() => {
    if (isOpen) {
      setLeverage(store.leverage);
    }
  }, [isOpen, store.leverage]);

  const maxLeverage = useMemo(() => {
    if (leverageBrackets.length === 0) return 20; // fallback
    return Math.max(...leverageBrackets.map(b => b.initialLeverage));
  }, [leverageBrackets]);

  const remainingNotional = useMemo(() => {
    if (leverageBrackets.length === 0) return '...';
    
    // Find the bracket that supports the currently selected leverage
    // The brackets define the max leverage for a given notional size.
    // To find the remaining notional for a specific leverage, we find the highest notional cap where initialLeverage >= selected leverage.
    let maxCap = 0;
    for (const b of leverageBrackets) {
      if (b.initialLeverage >= leverage) {
        if (b.notionalCap > maxCap) {
          maxCap = b.notionalCap;
        }
      }
    }
    
    if (maxCap === 0) return '...';
    
    // Format to 2 decimal places with commas
    return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(maxCap);
  }, [leverage, leverageBrackets]);

  const handleConfirm = async () => {
    if (leverage === store.leverage) {
      onClose();
      return;
    }

    if (!asterSigner || !userAddr) {
      store.setLeverage(leverage);
      onClose();
      return;
    }

    setIsSubmitting(true);
    try {
      await changeLeverage(asterSigner, userAddr, selectedSymbol.replace('-', ''), leverage);
      store.setLeverage(leverage);
      onClose();
    } catch (err) {
      console.error('Failed to change leverage:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLeverage(parseInt(e.target.value, 10));
  };

  const increment = () => setLeverage(Math.min(maxLeverage, leverage + 1));
  const decrement = () => setLeverage(Math.max(1, leverage - 1));

  // Generate dynamic steps for the slider track labels based on maxLeverage
  const generateSteps = () => {
    const steps = [1];
    const stepSize = Math.floor(maxLeverage / 5);
    for (let i = 1; i < 5; i++) {
      steps.push(Math.round(stepSize * i));
    }
    steps.push(maxLeverage);
    return steps;
  };

  const steps = useMemo(generateSteps, [maxLeverage]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`${selectedSymbol} Adjust leverage`} width="w-[400px]">
      <div className="space-y-6">
        <div>
          <label className="text-secondary text-[12px] block mb-2">Leverage</label>
          <div className="flex items-center justify-between border border-[#2B2B2B] bg-[#111111] rounded-xl px-4 py-3">
            <button onClick={decrement} className="text-[#888] hover:text-white transition-colors">
              <Minus size={16} />
            </button>
            <input 
              type="number"
              value={leverage}
              onChange={(e) => setLeverage(Math.max(1, Math.min(maxLeverage, parseInt(e.target.value) || 1)))}
              className="bg-transparent text-white text-center font-semibold w-16 outline-none"
            />
            <button onClick={increment} className="text-[#888] hover:text-white transition-colors">
              <Plus size={16} />
            </button>
          </div>
        </div>

        <div className="relative pt-2">
          <input 
            type="range"
            min="1"
            max={maxLeverage}
            value={leverage}
            onChange={handleSliderChange}
            className="w-full h-1 bg-[#2B2B2B] rounded-lg appearance-none cursor-pointer accent-[#E0A865]"
          />
          <div className="flex justify-between text-[#888] text-[10px] mt-2 px-1">
            {steps.map((step, i) => (
              <span key={i}>{step}x</span>
            ))}
          </div>
        </div>

        <div className="border border-[#2B2B2B] bg-[#111111] p-4 rounded-xl text-center space-y-1">
          <p className="text-secondary text-[11px]">Remaining openable notional value</p>
          <p className="text-white text-[14px] font-semibold">{remainingNotional} USDT</p>
          <p className="text-[#666] text-[10px] pt-1">
            The maximum notional value you can open under your current leverage and system risk control limits. <span className="text-[#E0A865] cursor-pointer hover:underline">Learn more</span>
          </p>
        </div>

        <p className="text-secondary text-[11px] leading-relaxed">
          Please note that leverage changing will also apply for open positions and open orders. Selecting higher leverage (such as 10x) increases your chances of liquidation.
        </p>

        <button 
          onClick={handleConfirm}
          disabled={isSubmitting}
          className="w-full bg-gradient-to-r from-[#EBD197] to-[#B48348] hover:opacity-90 text-black font-semibold py-3 rounded-xl transition-opacity disabled:opacity-50"
        >
          {isSubmitting ? 'Confirming...' : 'Confirm'}
        </button>
      </div>
    </Modal>
  );
};
