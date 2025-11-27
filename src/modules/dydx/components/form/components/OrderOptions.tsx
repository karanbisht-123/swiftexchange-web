import { OrderTypeEnum } from '../../../types/trading.types';

interface OrderOptionsProps {
  orderType: OrderTypeEnum;
  postOnly: boolean;
  reduceOnly: boolean;
  onPostOnlyChange: (checked: boolean) => void;
  onReduceOnlyChange: (checked: boolean) => void;
}

export const OrderOptions: React.FC<OrderOptionsProps> = ({
  orderType,
  postOnly,
  reduceOnly,
  onPostOnlyChange,
  onReduceOnlyChange,
}) => {
  return (
    <div className="flex gap-4 px-4">
      {orderType === OrderTypeEnum.LIMIT && (
        <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
          <input
            type="checkbox"
            checked={postOnly}
            onChange={e => onPostOnlyChange(e.target.checked)}
            className="rounded w-4 h-4"
          />
          Post-Only
        </label>
      )}
      <label className="flex items-center gap-2 text-xs text-gray-400 cursor-pointer">
        <input
          type="checkbox"
          checked={reduceOnly}
          onChange={e => onReduceOnlyChange(e.target.checked)}
          className="rounded w-4 h-4"
        />
        Reduce-Only
      </label>
    </div>
  );
};
