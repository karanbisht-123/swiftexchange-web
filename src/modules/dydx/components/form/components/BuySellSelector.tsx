import type { OrderSideEnum } from '../../../types/trading.types';

interface BuySellSelectorProps {
  selected: OrderSideEnum;
  onChange: (side: OrderSideEnum) => void;
}

const SIDES = {
  BUY: 'BUY' as const,
  SELL: 'SELL' as const,
};

export const BuySellSelector: React.FC<BuySellSelectorProps> = ({ selected, onChange }) => {
  return (
    <div className="flex border-b border-color bg-primary overflow-hidden">
      <button
        onClick={() => onChange(SIDES.BUY)}
        className={`flex-1 py-3 text-sm font-bold transition-all duration-200 border-b-3 ${selected === SIDES.BUY
          ? 'bg-green-500/20 text-green-500 border-green-600 shadow-sm'
          : 'text-muted border-transparent hover:text-primary hover:bg-green-500/5'
          }`}
      >
        Buy | Long
      </button>
      <button
        onClick={() => onChange(SIDES.SELL)}
        className={`flex-1 py-3 text-sm font-bold transition-all duration-200 border-b-3 ${selected === SIDES.SELL
          ? 'bg-red-500/20 text-red-500 border-red-600 shadow-sm'
          : 'text-muted border-transparent hover:text-primary hover:bg-red-500/5'
          }`}
      >
        Sell | Short
      </button>
    </div>
  );
};
