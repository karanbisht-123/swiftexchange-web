import { useEffect, useMemo, useState } from 'react';

import { useDydxTrading } from '../../hooks/useDydxTrading';
import { useDydxWallet } from '../../hooks/useDydxWallet';
import { useMarkets } from '../../hooks/useMarkets';
import useMarketStore from '../../store/marketStore';
import type { OrderSideEnum, OrderTypeEnum } from '../../types/trading.types';
import { Notification, type NotificationType } from '../../utils/Notification';
import {
  getMaxBuyingPower,
  validateOrderPrice,
  validateOrderSize,
  validateTriggerPrice,
} from '../../utils/OrderValidation';
import { type CurrencyMode, currencyService } from '../../utils/currencyService';
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

const PRICE_REQUIRED_TYPES = ['LIMIT', 'STOP_LIMIT', 'TAKE_PROFIT_LIMIT'] as const;

const TRIGGER_REQUIRED_TYPES = [
  'STOP_MARKET',
  'STOP_LIMIT',
  'TAKE_PROFIT_MARKET',
  'TAKE_PROFIT_LIMIT',
] as const;

const CONDITIONAL_TYPES = [
  'STOP_MARKET',
  'STOP_LIMIT',
  'TAKE_PROFIT_MARKET',
  'TAKE_PROFIT_LIMIT',
] as const;

const convertToSeconds = (value: number, unit: GoodTilUnit): number => {
  const multipliers = {
    minutes: 60,
    hours: 3600,
    days: 86400,
    weeks: 604800,
  };
  return value * multipliers[unit];
};

const validateGoodTil = (
  value: number,
  unit: GoodTilUnit,
  isConditional: boolean
): string | null => {
  const seconds = convertToSeconds(value, unit);
  const maxSeconds = isConditional ? 94 * 86400 : 28 * 86400;

  if (seconds > maxSeconds) {
    const maxDays = isConditional ? 94 : 28;
    return `Maximum duration is ${maxDays} days`;
  }

  if (value < 1) {
    return 'Minimum value is 1';
  }

  return null;
};

export const DydxTradingForm: React.FC = () => {
  const { selectedMarket } = useMarketStore();
  const { getMarket } = useMarkets();
  const marketData = selectedMarket ? getMarket(selectedMarket) : null;
  const { balance } = useDydxWallet();
  const { placeOrder, isPlacingOrder, orderError, clearOrderError, canTrade } = useDydxTrading();

  const [orderType, setOrderType] = useState<OrderTypeEnum>('LIMIT');
  const [side, setSide] = useState<OrderSideEnum>('BUY');
  const [marginType, setMarginType] = useState<MarginType>('CROSS');
  const [size, setSize] = useState('');
  const [price, setPrice] = useState('');
  const [triggerPrice, setTriggerPrice] = useState('');
  const [leverage, setLeverage] = useState(1.0);
  const [currencyMode, setCurrencyMode] = useState<CurrencyMode>('USD');

  const [timeInForce, setTimeInForce] = useState<TimeInForceOption>('GTT');
  const [goodTilValue, setGoodTilValue] = useState(28);
  const [goodTilUnit, setGoodTilUnit] = useState<GoodTilUnit>('days');
  const [reduceOnly, setReduceOnly] = useState(false);
  const [postOnly, setPostOnly] = useState(false);

  const [sizeError, setSizeError] = useState<string>('');
  const [sizeWarning, setSizeWarning] = useState<string>('');
  const [priceError, setPriceError] = useState<string>('');
  const [priceWarning, setPriceWarning] = useState<string>('');
  const [triggerError, setTriggerError] = useState<string>('');
  const [triggerWarning, setTriggerWarning] = useState<string>('');
  const [goodTilError, setGoodTilError] = useState<string>('');

  const [notifications, setNotifications] = useState<NotificationState[]>([]);
  const [notificationCounter, setNotificationCounter] = useState(0);

  const isConditional = CONDITIONAL_TYPES.includes(orderType as any);
  const isLimit = orderType === 'LIMIT';

  const maxLeverage = useMemo(() => {
    if (!marketData?.initialMarginFraction) return 20;
    const imf = parseFloat(marketData.initialMarginFraction);
    return Math.floor(1 / imf);
  }, [marketData?.initialMarginFraction]);

  const maxBuyingPower = useMemo(() => {
    return getMaxBuyingPower(balance, marketData, leverage);
  }, [balance, marketData, leverage]);

  const hasValidationErrors = !!(sizeError || priceError || triggerError || goodTilError);
  const isFormValid = !hasValidationErrors && size && canTrade;

  useEffect(() => {
    if (leverage > maxLeverage) {
      setLeverage(maxLeverage);
    }
  }, [maxLeverage, leverage]);

  useEffect(() => {
    if (marketData?.oraclePrice && !price) {
      setPrice(marketData.oraclePrice);
    }
  }, [marketData?.oraclePrice, price]);

  useEffect(() => {
    if (orderError) {
      addNotification('error', orderError, 'Order Failed');
      clearOrderError();
    }
  }, [orderError, clearOrderError]);

  useEffect(() => {
    if (reduceOnly && isLimit && timeInForce === 'GTT') {
      setTimeInForce('IOC');
      addNotification('warning', 'Reduce-only orders must use IOC or FOK', 'Time-in-Force Changed');
    }
  }, [reduceOnly, isLimit, timeInForce]);

  useEffect(() => {
    if (postOnly && (!isLimit || reduceOnly)) {
      setPostOnly(false);
      if (!isLimit) {
        addNotification('warning', 'Post-only only works with limit orders', 'Post-Only Disabled');
      }
    }
  }, [postOnly, isLimit, reduceOnly, orderType]);

  useEffect(() => {
    if (size && marketData) {
      const validation = validateOrderSize(
        marketData,
        size,
        currencyMode,
        balance,
        leverage,
        orderType
      );
      setSizeError(validation.isValid ? '' : validation.error || '');
      setSizeWarning(validation.warning || '');
    } else {
      setSizeError('');
      setSizeWarning('');
    }
  }, [size, marketData, currencyMode, balance, leverage, orderType]);

  useEffect(() => {
    if (PRICE_REQUIRED_TYPES.includes(orderType as any) && price) {
      const validation = validateOrderPrice(marketData, price);
      setPriceError(validation.isValid ? '' : validation.error || '');
      setPriceWarning(validation.warning || '');
    } else {
      setPriceError('');
      setPriceWarning('');
    }
  }, [price, orderType, marketData]);

  useEffect(() => {
    if (TRIGGER_REQUIRED_TYPES.includes(orderType as any) && triggerPrice) {
      const validation = validateTriggerPrice(marketData, triggerPrice, side, orderType);
      setTriggerError(validation.isValid ? '' : validation.error || '');
      setTriggerWarning(validation.warning || '');
    } else {
      setTriggerError('');
      setTriggerWarning('');
    }
  }, [triggerPrice, orderType, marketData, side]);

  useEffect(() => {
    if ((isLimit && timeInForce === 'GTT') || isConditional) {
      const error = validateGoodTil(goodTilValue, goodTilUnit, isConditional);
      setGoodTilError(error || '');
    } else {
      setGoodTilError('');
    }
  }, [goodTilValue, goodTilUnit, isConditional, isLimit, timeInForce]);

  const handleCurrencyModeChange = (newMode: CurrencyMode) => {
    if (!marketData || !size) {
      setCurrencyMode(newMode);
      return;
    }

    const currentConversion = currencyService.parseInput(size, currencyMode, marketData);

    if (currentConversion.isValid) {
      if (newMode === 'USD') {
        setSize(currencyService.formatUsdAmount(currentConversion.usdAmount));
      } else {
        const decimals = currencyService.getStepSizeDecimals(marketData.stepSize || '0.00000001');
        setSize(currencyService.formatBaseAmount(currentConversion.baseAmount, decimals));
      }
    }

    setCurrencyMode(newMode);
  };

  const handlePlaceOrder = async () => {
    if (!selectedMarket || !canTrade) {
      addNotification('warning', 'Please connect your wallet', 'Wallet Not Connected');
      return;
    }

    if (!isFormValid) {
      addNotification('error', 'Please fix validation errors', 'Invalid Order');
      return;
    }

    if (!marketData) {
      addNotification('error', 'Market data not available', 'Error');
      return;
    }

    const conversion = currencyService.parseInput(size, currencyMode, marketData);
    if (!conversion.isValid) {
      addNotification('error', 'Invalid order size', 'Error');
      return;
    }

    let finalQuantity = conversion.baseAmount;
    if (marketData.stepSize) {
      finalQuantity = currencyService.roundToStepSize(finalQuantity, marketData.stepSize);
    }

    const finalPrice = PRICE_REQUIRED_TYPES.includes(orderType as any)
      ? parseFloat(price)
      : undefined;

    const finalTriggerPrice = TRIGGER_REQUIRED_TYPES.includes(orderType as any)
      ? parseFloat(triggerPrice)
      : undefined;

    let goodTilTimeInSeconds: number | undefined;
    if ((isLimit && timeInForce === 'GTT') || isConditional) {
      const durationSeconds = convertToSeconds(goodTilValue, goodTilUnit);
      goodTilTimeInSeconds = Math.floor(Date.now() / 1000) + durationSeconds;
    }

    console.log(side, '-----------hii i am order Sider');
    const result = await placeOrder({
      market: selectedMarket,
      side,
      type: orderType,
      size: finalQuantity,
      price: finalPrice,
      triggerPrice: finalTriggerPrice,
      timeInForce,
      reduceOnly,
      postOnly: postOnly && orderType === 'LIMIT',
      goodTilTimeInSeconds,
    });

    if (result.success) {
      addNotification(
        'success',
        `${side} ${finalQuantity} ${marketData.baseAsset}`,
        'Order Placed'
      );
      setSize('');
      setPrice(marketData?.oraclePrice || '');
      setTriggerPrice('');
    } else {
      addNotification('error', result.userMessage || result.error || 'Failed', 'Order Failed');
    }
  };

  const addNotification = (type: NotificationType, message: string, title?: string) => {
    const id = notificationCounter;
    setNotificationCounter(prev => prev + 1);
    setNotifications(prev => [...prev, { id, type, message, title }]);
  };

  const removeNotification = (id: number) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
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
          sizeError={sizeError}
          sizeWarning={sizeWarning}
          priceError={priceError}
          priceWarning={priceWarning}
          triggerError={triggerError}
          triggerWarning={triggerWarning}
          currencyMode={currencyMode}
          onCurrencyModeChange={handleCurrencyModeChange}
          baseAsset={marketData?.baseAsset || 'USD'}
        />

        {maxBuyingPower > 0 && (
          <div className="px-4">
            <div className="text-xs text-gray-400">
              Max: ${maxBuyingPower.toFixed(2)} @ {leverage}x
            </div>
          </div>
        )}

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

        {goodTilError && (
          <div className="px-4">
            <div className="text-xs text-red-500">{goodTilError}</div>
          </div>
        )}

        <div className="px-4">
          <button
            onClick={handlePlaceOrder}
            disabled={isPlacingOrder || !isFormValid}
            className={`w-full py-3 rounded-lg font-bold text-sm transition-colors
            ${
              side === 'BUY' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
            } disabled:opacity-50 disabled:cursor-not-allowed text-white`}
          >
            {isPlacingOrder ? 'Placing Order...' : `${side} ${selectedMarket}`}
          </button>
        </div>
      </div>
    </div>
  );
};
