import { useEffect, useState } from 'react';

import type { OrderSideEnum } from '../../../types/trading.types';
import { validateNumberInput } from '../../../utils/inputValidation';

interface TpSlInputsProps {
  side: OrderSideEnum;
  entryPrice: number;
  tpPrice: string;
  slPrice: string;
  onChangeTp: (price: string) => void;
  onChangeSl: (price: string) => void;
}

export const TpSlInputs: React.FC<TpSlInputsProps> = ({
  side,
  entryPrice,
  tpPrice,
  slPrice,
  onChangeTp,
  onChangeSl,
}) => {
  const [tpGain, setTpGain] = useState('');
  const [slLoss, setSlLoss] = useState('');

  useEffect(() => {
    if (!entryPrice || entryPrice <= 0) return;

    if (tpPrice) {
      const price = parseFloat(tpPrice);
      if (!isNaN(price)) {
        const gain =
          side === 'BUY'
            ? ((price - entryPrice) / entryPrice) * 100
            : ((entryPrice - price) / entryPrice) * 100;
        setTpGain(gain.toFixed(2));
      } else {
        setTpGain('');
      }
    } else {
      setTpGain('');
    }

    if (slPrice) {
      const price = parseFloat(slPrice);
      if (!isNaN(price)) {
        const loss =
          side === 'BUY'
            ? ((entryPrice - price) / entryPrice) * 100
            : ((price - entryPrice) / entryPrice) * 100;
        setSlLoss(loss.toFixed(2));
      } else {
        setSlLoss('');
      }
    } else {
      setSlLoss('');
    }
  }, [tpPrice, slPrice, entryPrice, side]);

  const handleTpGainChange = (gainStr: string) => {
    setTpGain(gainStr);
    const gain = parseFloat(gainStr);
    if (!isNaN(gain) && entryPrice > 0) {
      const price = side === 'BUY' ? entryPrice * (1 + gain / 100) : entryPrice * (1 - gain / 100);
      onChangeTp(price.toFixed(2));
    } else {
      onChangeTp('');
    }
  };

  const handleSlLossChange = (lossStr: string) => {
    setSlLoss(lossStr);
    const loss = parseFloat(lossStr);
    if (!isNaN(loss) && entryPrice > 0) {
      const price = side === 'BUY' ? entryPrice * (1 - loss / 100) : entryPrice * (1 + loss / 100);
      onChangeSl(price.toFixed(2));
    } else {
      onChangeSl('');
    }
  };

  return (
    <div className="space-y-4 px-4 pb-2">
      <div className="space-y-1.5 animate-fade-in">
        <div className="flex items-center justify-between mb-2 ml-1">
          <label className="text-xs font-semibold text-muted uppercase tracking-wider">
            Take Profit
          </label>
          <span className="text-[10px] text-green-500 font-bold uppercase tracking-wider bg-green-500/10 px-2 py-0.5 rounded">
            Target
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="relative group">
            <input
              type="text"
              inputMode="decimal"
              value={tpPrice}
              onChange={e => onChangeTp(validateNumberInput(e.target.value))}
              placeholder="Price"
              className="w-full bg-primary border border-color rounded-xl pl-4 pr-6 py-3 text-sm text-primary placeholder-muted focus:outline-none focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 transition-all shadow-sm"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-muted pointer-events-none">
              $
            </span>
          </div>
          <div className="relative group">
            <input
              type="text"
              inputMode="decimal"
              value={tpGain}
              onChange={e => handleTpGainChange(validateNumberInput(e.target.value))}
              placeholder="Gain"
              className="w-full bg-primary border border-color rounded-xl pl-4 pr-6 py-3 text-sm text-green-500 placeholder-muted focus:outline-none focus:border-green-500/50 focus:ring-2 focus:ring-green-500/20 transition-all shadow-sm font-medium"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-muted pointer-events-none">
              %
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-1.5 animate-fade-in pt-2">
        <div className="flex items-center justify-between mb-2 ml-1">
          <label className="text-xs font-semibold text-muted uppercase tracking-wider">
            Stop Loss
          </label>
          <span className="text-[10px] text-red-500 font-bold uppercase tracking-wider bg-red-500/10 px-2 py-0.5 rounded">
            Protection
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="relative group">
            <input
              type="text"
              inputMode="decimal"
              value={slPrice}
              onChange={e => onChangeSl(validateNumberInput(e.target.value))}
              placeholder="Price"
              className="w-full bg-primary border border-color rounded-xl pl-4 pr-6 py-3 text-sm text-primary placeholder-muted focus:outline-none focus:border-red-500/50 focus:ring-2 focus:ring-red-500/20 transition-all shadow-sm"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-muted pointer-events-none">
              $
            </span>
          </div>
          <div className="relative group">
            <input
              type="text"
              inputMode="decimal"
              value={slLoss}
              onChange={e => handleSlLossChange(validateNumberInput(e.target.value))}
              placeholder="Loss"
              className="w-full bg-primary border border-color rounded-xl pl-4 pr-6 py-3 text-sm text-red-500 placeholder-muted focus:outline-none focus:border-red-500/50 focus:ring-2 focus:ring-red-500/20 transition-all shadow-sm font-medium"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-muted pointer-events-none">
              %
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
