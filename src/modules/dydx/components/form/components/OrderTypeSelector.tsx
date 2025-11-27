import { OrderTypeEnum } from '../../../types/trading.types';

interface OrderTypeSelectorProps {
  selected: OrderTypeEnum;
  onChange: (type: OrderTypeEnum) => void;
}

export const OrderTypeSelector: React.FC<OrderTypeSelectorProps> = ({ selected, onChange }) => {
  const orderTypes = [
    { value: OrderTypeEnum.LIMIT, label: 'Limit' },
    { value: OrderTypeEnum.MARKET, label: 'Market' },
    { value: OrderTypeEnum.STOP_LIMIT, label: 'Stop Limit' },
    { value: OrderTypeEnum.STOP_MARKET, label: 'Stop Market' },
    { value: OrderTypeEnum.TAKE_PROFIT_LIMIT, label: 'TP Limit' },
    { value: OrderTypeEnum.TAKE_PROFIT_MARKET, label: 'TP Market' },
  ];

  return (
    <div className="overflow-x-auto px-2 border-b border-gray-600">
      <div className="flex gap-2 min-w-max">
        {orderTypes.map(type => (
          <button
            key={type.value}
            onClick={() => onChange(type.value)}
            className={`px-4 py-2 text-xs font-medium whitespace-nowrap transition-colors border-b-2 ${
              selected === type.value
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
