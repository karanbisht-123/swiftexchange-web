import { OrderTypeEnum } from '../../../types/trading.types';

interface OrderFormInputsProps {
  orderType: OrderTypeEnum;
  size: string;
  price: string;
  triggerPrice: string;
  currentPrice: string;
  bestPrices: { bestBid: string; bestAsk: string };
  onSizeChange: (value: string) => void;
  onPriceChange: (value: string) => void;
  onTriggerPriceChange: (value: string) => void;
}

export const OrderFormInputs: React.FC<OrderFormInputsProps> = ({
  orderType,
  size,
  price,
  triggerPrice,
  currentPrice,
  bestPrices,
  onSizeChange,
  onPriceChange,
  onTriggerPriceChange,
}) => {
  const PRICE_TYPES: OrderTypeEnum[] = [
    OrderTypeEnum.LIMIT,
    OrderTypeEnum.STOP_LIMIT,
    OrderTypeEnum.TAKE_PROFIT_LIMIT,
  ];

  const TRIGGER_TYPES: OrderTypeEnum[] = [
    OrderTypeEnum.STOP_MARKET,
    OrderTypeEnum.STOP_LIMIT,
    OrderTypeEnum.TAKE_PROFIT_MARKET,
    OrderTypeEnum.TAKE_PROFIT_LIMIT,
  ];

  const showPrice = PRICE_TYPES.includes(orderType);
  const showTriggerPrice = TRIGGER_TYPES.includes(orderType);

  const priceButtons = (
    <div className="flex gap-1 mt-1">
      <button
        type="button"
        onClick={() => onPriceChange(currentPrice)}
        className="px-2 py-0.5 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300"
      >
        Last
      </button>
      <button
        type="button"
        onClick={() => onPriceChange(bestPrices.bestBid)}
        className="px-2 py-0.5 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300"
      >
        Bid
      </button>
      <button
        type="button"
        onClick={() => onPriceChange(bestPrices.bestAsk)}
        className="px-2 py-0.5 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300"
      >
        Ask
      </button>
    </div>
  );

  const triggerButtons = (
    <div className="flex gap-1 mt-1">
      <button
        type="button"
        onClick={() => onTriggerPriceChange(currentPrice)}
        className="px-2 py-0.5 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300"
      >
        Last
      </button>
      <button
        type="button"
        onClick={() => onTriggerPriceChange(bestPrices.bestBid)}
        className="px-2 py-0.5 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300"
      >
        Bid
      </button>
      <button
        type="button"
        onClick={() => onTriggerPriceChange(bestPrices.bestAsk)}
        className="px-2 py-0.5 text-xs bg-gray-700 hover:bg-gray-600 rounded text-gray-300"
      >
        Ask
      </button>
    </div>
  );

  return (
    <div className="space-y-3 px-4">
      {/* Limit Price */}
      {showPrice && (
        <div>
          <label className="block text-xs text-gray-400 mb-1.5">Limit Price (USD)</label>
          <input
            type="text"
            value={price}
            onChange={e => onPriceChange(e.target.value)}
            placeholder="0.00"
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-gray-600"
          />
          {priceButtons}
        </div>
      )}

      {/* Trigger Price */}
      {showTriggerPrice && (
        <div>
          <label className="block text-xs text-gray-400 mb-1.5">Trigger Price (USD)</label>
          <input
            type="text"
            value={triggerPrice}
            onChange={e => onTriggerPriceChange(e.target.value)}
            placeholder="0.00"
            className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-gray-600"
          />
          {triggerButtons}
        </div>
      )}

      {/* Amount/Size */}
      <div>
        <label className="block text-xs text-gray-400 mb-1.5">Amount (USD)</label>
        <input
          type="text"
          value={size}
          onChange={e => onSizeChange(e.target.value)}
          placeholder="0.00"
          className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-gray-600"
        />
      </div>
    </div>
  );
};
