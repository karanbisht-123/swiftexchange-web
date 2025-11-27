import { OrderSideEnum } from '../../../types/trading.types';

interface BuySellSelectorProps {
  selected: OrderSideEnum;
  onChange: (side: OrderSideEnum) => void;
}

export const BuySellSelector: React.FC<BuySellSelectorProps> = ({ selected, onChange }) => {
  return (
    <div className="flex border-b border-gray-600 overflow-hidden">
      <button
        onClick={() => onChange(OrderSideEnum.BUY)}
        className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
          selected === OrderSideEnum.BUY
            ? 'bg-green-600/40 text-white border-b-2 border-green-600'
            : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
        }`}
      >
        Buy | Long
      </button>
      <button
        onClick={() => onChange(OrderSideEnum.SELL)}
        className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
          selected === OrderSideEnum.SELL
            ? 'bg-red-600/40 text-white border-b-2 border-red-600'
            : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
        }`}
      >
        Sell | Short
      </button>
    </div>
  );
};
