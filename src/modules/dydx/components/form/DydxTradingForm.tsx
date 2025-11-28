import { useEffect, useState } from 'react';

import { useDydxTrading } from '../../hooks/useDydxTrading';
import { useMarkets } from '../../hooks/useMarkets';
import useMarketStore from '../../store/marketStore';
import { OrderSideEnum, OrderTypeEnum } from '../../types/trading.types';
import { Notification, type NotificationType } from '../../utils/Notification';
import { DydxWalletConnect } from '../DydxWalletConnect';
import {
  AdvancedOptions,
  type GoodTilUnit,
  type TimeInForceOption,
} from './components/AdvancedOptions';
import { BuySellSelector } from './components/BuySellSelector';
import { LeverageSlider } from './components/LeverageSlider';
import { type MarginType, MarginTypeSelector } from './components/MarginTypeSelector';
import { OrderFormInputs } from './components/OrderFormInputs';
import { OrderTypeSelector } from './components/OrderTypeSelector';

interface NotificationState {
  id: number;
  type: NotificationType;
  message: string;
  title?: string;
}

export const DydxTradingForm: React.FC = () => {
  const { selectedMarket } = useMarketStore();
  const { getMarket } = useMarkets();
  const marketData = selectedMarket ? getMarket(selectedMarket) : null;

  const { placeOrder, isPlacingOrder, orderError, clearOrderError, canTrade } = useDydxTrading();

  const [orderType, setOrderType] = useState<OrderTypeEnum>(OrderTypeEnum.LIMIT);
  const [side, setSide] = useState<OrderSideEnum>(OrderSideEnum.BUY);
  const [marginType, setMarginType] = useState<MarginType>('CROSS');
  const [size, setSize] = useState('');
  const [price, setPrice] = useState('');
  const [triggerPrice, setTriggerPrice] = useState('');
  const [leverage, setLeverage] = useState(1.0);
  const [timeInForce, setTimeInForce] = useState<TimeInForceOption>('GTT');
  const [goodTilValue, setGoodTilValue] = useState(28);
  const [goodTilUnit, setGoodTilUnit] = useState<GoodTilUnit>('days');
  const [reduceOnly, setReduceOnly] = useState(false);
  const [postOnly, setPostOnly] = useState(false);

  // Notification state
  const [notifications, setNotifications] = useState<NotificationState[]>([]);
  const [notificationCounter, setNotificationCounter] = useState(0);

  const maxLeverage = 20;

  useEffect(() => {
    if (marketData?.oraclePrice && !price) {
      setPrice(marketData.oraclePrice);
    }
  }, [marketData?.oraclePrice, price]);

  // Handle orderError from hook
  useEffect(() => {
    if (orderError) {
      addNotification('error', orderError, 'Order Failed');
      clearOrderError();
    }
  }, [orderError, clearOrderError]);

  const addNotification = (type: NotificationType, message: string, title?: string) => {
    const id = notificationCounter;
    setNotificationCounter(prev => prev + 1);
    setNotifications(prev => [...prev, { id, type, message, title }]);
  };

  const removeNotification = (id: number) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const handlePlaceOrder = async () => {
    if (!selectedMarket || !canTrade) {
      addNotification(
        'warning',
        'Please connect your wallet and ensure you have an active subaccount',
        'Wallet Not Connected'
      );
      return;
    }

    if (!size || parseFloat(size) <= 0 || isNaN(parseFloat(size))) {
      addNotification('error', 'Please enter a valid order size', 'Invalid Size');
      return;
    }

    const PRICE_REQUIRED_TYPES = new Set<OrderTypeEnum>([
      OrderTypeEnum.LIMIT,
      OrderTypeEnum.STOP_LIMIT,
      OrderTypeEnum.TAKE_PROFIT_LIMIT,
    ]);

    const TRIGGER_REQUIRED_TYPES = new Set<OrderTypeEnum>([
      OrderTypeEnum.STOP_MARKET,
      OrderTypeEnum.STOP_LIMIT,
      OrderTypeEnum.TAKE_PROFIT_MARKET,
      OrderTypeEnum.TAKE_PROFIT_LIMIT,
    ]);

    const needsPrice = PRICE_REQUIRED_TYPES.has(orderType);
    const needsTrigger = TRIGGER_REQUIRED_TYPES.has(orderType);

    if (needsPrice && (!price || parseFloat(price) <= 0 || isNaN(parseFloat(price)))) {
      addNotification('error', 'Please enter a valid price', 'Invalid Price');
      return;
    }

    if (
      needsTrigger &&
      (!triggerPrice || parseFloat(triggerPrice) <= 0 || isNaN(parseFloat(triggerPrice)))
    ) {
      addNotification('error', 'Please enter a valid trigger price', 'Invalid Trigger Price');
      return;
    }

    const finalPrice = needsPrice ? price : undefined;

    const result = await placeOrder({
      market: selectedMarket,
      side,
      type: orderType,
      size: parseFloat(size),
      price: finalPrice ? parseFloat(finalPrice) : undefined,
      triggerPrice: triggerPrice ? parseFloat(triggerPrice) : undefined,
      timeInForce,
      reduceOnly,
      postOnly: postOnly && orderType === OrderTypeEnum.LIMIT,
    });

    if (result.success) {
      addNotification(
        'success',
        `${side} ${size} ${selectedMarket} @ ${finalPrice || 'Market'}`,
        'Order Placed Successfully'
      );

      setSize('');
      setPrice(marketData?.oraclePrice || '');
      setTriggerPrice('');
    } else {
      addNotification(
        'error',
        result.userMessage || result.error || 'Failed to place order',
        'Order Failed'
      );
    }
  };

  return (
    <div className="max-w-lvw lg:max-w-[300px] h-full overflow-y-auto border-l border-gray-600">
      {notifications.map(notif => (
        <Notification
          key={notif.id}
          type={notif.type}
          message={notif.message}
          title={notif.title}
          onClose={() => removeNotification(notif.id)}
          autoClose={true}
          autoCloseDuration={5000}
        />
      ))}
      <div className="hidden lg:block">
        <DydxWalletConnect />
      </div>

      <div className="space-y-4">
        <BuySellSelector selected={side} onChange={setSide} />
        <MarginTypeSelector selected={marginType} onChange={setMarginType} />
        <OrderTypeSelector selected={orderType} onChange={setOrderType} />
        <OrderFormInputs
          orderType={orderType}
          size={size}
          price={price}
          triggerPrice={triggerPrice}
          currentPrice={marketData?.oraclePrice || '0'}
          bestPrices={{ bestBid: '0', bestAsk: '0' }}
          onSizeChange={setSize}
          onPriceChange={setPrice}
          onTriggerPriceChange={setTriggerPrice}
        />

        <div className="px-4">
          <LeverageSlider leverage={leverage} maxLeverage={maxLeverage} onChange={setLeverage} />
        </div>

        <AdvancedOptions
          orderType={orderType}
          timeInForce={timeInForce}
          goodTilValue={goodTilValue}
          goodTilUnit={goodTilUnit}
          postOnly={postOnly}
          reduceOnly={reduceOnly}
          onTimeInForceChange={setTimeInForce}
          onGoodTilValueChange={setGoodTilValue}
          onGoodTilUnitChange={setGoodTilUnit}
          onPostOnlyChange={setPostOnly}
          onReduceOnlyChange={setReduceOnly}
        />

        <div className="px-4">
          <button
            onClick={handlePlaceOrder}
            disabled={isPlacingOrder || !canTrade}
            className={`w-full py-3 rounded-lg font-bold text-sm transition-colors
            ${
              side === OrderSideEnum.BUY
                ? 'bg-green-600 hover:bg-green-700'
                : 'bg-red-600 hover:bg-red-700'
            } disabled:opacity-50 disabled:cursor-not-allowed text-white`}
          >
            {isPlacingOrder ? 'Placing Order...' : `${side} ${selectedMarket}`}
          </button>
        </div>
      </div>
    </div>
  );
};
