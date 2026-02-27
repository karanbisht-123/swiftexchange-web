import type { OrderTypeEnum } from '../../../types/trading.types';

interface OrderTypeSelectorProps {
  selected: OrderTypeEnum;
  onChange: (type: OrderTypeEnum) => void;
}

const ORDER_TYPES = {
  LIMIT: 'LIMIT' as const,
  MARKET: 'MARKET' as const,
  STOP_LIMIT: 'STOP_LIMIT' as const,
  STOP_MARKET: 'STOP_MARKET' as const,
  TAKE_PROFIT_LIMIT: 'TAKE_PROFIT_LIMIT' as const,
  TAKE_PROFIT_MARKET: 'TAKE_PROFIT_MARKET' as const,
} as const;

const orderTypeOptions = [
  { value: ORDER_TYPES.LIMIT, label: 'Limit' },
  { value: ORDER_TYPES.MARKET, label: 'Market' },
  { value: ORDER_TYPES.STOP_LIMIT, label: 'Stop Limit' },
  { value: ORDER_TYPES.STOP_MARKET, label: 'Stop Market' },
  { value: ORDER_TYPES.TAKE_PROFIT_LIMIT, label: 'TP Limit' },
  { value: ORDER_TYPES.TAKE_PROFIT_MARKET, label: 'TP Market' },
] as const;

export const OrderTypeSelector: React.FC<OrderTypeSelectorProps> = ({ selected, onChange }) => {
  return (
    <div className="overflow-x-auto  border-b border-gray-600 hide-scrollbar">
      <div className="flex gap-2 min-w-max">
        {orderTypeOptions.map(type => (
          <button
            key={type.value}
            onClick={() => onChange(type.value)}
            className={`px-4 py-1 text-xs font-medium whitespace-nowrap transition-colors border-b-2 ${selected === type.value
              ? 'border-blue-500 text-white'
              : 'border-transparent text-gray-400 hover:text-white'
              }`}
          >
            {type.label}
          </button>
        ))}
      </div>
    </div>
  );
};
