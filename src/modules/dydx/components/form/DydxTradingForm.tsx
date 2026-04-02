import { useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { Notification, type NotificationType } from '../../../../components/common/Notification';
import { Tooltip } from '../../../../components/common/Tooltip';
import { useDydxTrading } from '../../hooks/useDydxTrading';
import { useDydxWallet } from '../../hooks/useDydxWallet';
import { useMarkets } from '../../hooks/useMarkets';
import { useSubaccounts } from '../../hooks/useSubaccounts';
import useMarketStore from '../../store/marketStore';
import useOrderPreviewStore from '../../store/orderPreviewStore';
import { useOrderbookClickStore } from '../../store/orderbookClickStore';
import type { MarginMode, OrderSideEnum, OrderTypeEnum } from '../../types/trading.types';
import {
  getMaxBuyingPower,
  getPriceDecimals,
  roundToTickSize,
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
import { MarginTypeSelector } from './components/MarginTypeSelector';
import { OrderFormInputs } from './components/OrderFormInputs';
import { OrderReceipt } from './components/OrderReceipt';
import { OrderTypeSelector } from './components/OrderTypeSelector';
import { TpSlInputs } from './components/TpSlInputs';

// NEW IMPORTS
import { dydxWalletService } from '../../service/dydxWalletService';
import {
  useWebSocketStore,
  selectRecentlyTerminalOrders,
  type TrackedOrder,
} from '../../store/websocketStore';

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

const ISOLATED_EQUITY_TIER_MIN = 20;

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
  _isConditional: boolean
): string | null => {
  const seconds = convertToSeconds(value, unit);
  const maxSeconds = 95 * 86400;

  if (seconds > maxSeconds) return 'Maximum duration is 95 days';
  if (value < 1) return 'Minimum value is 1';
  return null;
};

export const DydxTradingForm: React.FC = () => {
  const { selectedMarket } = useMarketStore();
  const { setOnPriceClick } = useOrderbookClickStore();
  const { getMarket } = useMarkets();
  const marketData = (selectedMarket ? getMarket(selectedMarket) : null) ?? null;
  const { balance } = useDydxWallet();
  const { placeOrder, isPlacingOrder, orderError, clearOrderError, canTrade } = useDydxTrading();
  const { activeSubaccountNumber, getNextIsolatedSubaccount, childSubaccounts } = useSubaccounts();

  const pendingMarginRequired = useOrderPreviewStore((s) => s.pendingMarginRequired);

  // ── Parent Subaccount Key (same as useDydxData) ──
  const address = dydxWalletService.getAddress();
  const subaccountNumber = dydxWalletService.getSubaccountNumber();
  const parentKey = address ? `parent_subaccount_${address}_${subaccountNumber}` : null;

  // ── Get parentData from Zustand ──
  const parentData = useWebSocketStore(
    useShallow((state) => (parentKey ? state.parentSubaccounts.get(parentKey) : undefined))
  );

  // ── Now safely call the selector ──
  const recentlyTerminalOrders = useMemo(
    () => selectRecentlyTerminalOrders(parentData),
    [parentData]
  );

  const [orderType, setOrderType] = useState<OrderTypeEnum>('LIMIT');
  const [side, setSide] = useState<OrderSideEnum>('BUY');
  const [marginMode, setMarginMode] = useState<MarginMode>('CROSS');
  const [size, setSize] = useState('');
  const [price, setPrice] = useState('');
  const [triggerPrice, setTriggerPrice] = useState('');
  const [leverage, setLeverage] = useState(() => {
    const marketKey = selectedMarket ? `dydx_leverage_${selectedMarket}` : 'dydx_leverage';
    const saved = localStorage.getItem(marketKey) ?? localStorage.getItem('dydx_leverage');
    return saved ? parseFloat(saved) : 1.0;
  });
  const [currencyMode, setCurrencyMode] = useState<CurrencyMode>('USD');

  const [timeInForce, setTimeInForce] = useState<TimeInForceOption>('GTT');
  const [goodTilValue, setGoodTilValue] = useState(28);
  const [goodTilUnit, setGoodTilUnit] = useState<GoodTilUnit>('days');
  const [reduceOnly, setReduceOnly] = useState(false);

  const [showTpSl, setShowTpSl] = useState(false);
  const [tpPrice, setTpPrice] = useState('');
  const [slPrice, setSlPrice] = useState('');

  const [sizeError, setSizeError] = useState<string>('');
  const [sizeWarning, setSizeWarning] = useState<string>('');
  const [priceError, setPriceError] = useState<string>('');
  const [priceWarning, setPriceWarning] = useState<string>('');
  const [triggerError, setTriggerError] = useState<string>('');
  const [triggerWarning, setTriggerWarning] = useState<string>('');
  const [goodTilError, setGoodTilError] = useState<string>('');

  const [notifications, setNotifications] = useState<NotificationState[]>([]);
  const [notificationCounter, setNotificationCounter] = useState(0);

  const shownRejectionsRef = useRef<Set<string>>(new Set());

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

  const targetSubaccount = useMemo(() => {
    if (marginMode === 'CROSS') return activeSubaccountNumber;
    return getNextIsolatedSubaccount(selectedMarket);
  }, [marginMode, activeSubaccountNumber, selectedMarket, getNextIsolatedSubaccount]);

  const isolatedEquity = useMemo(() => {
    if (marginMode !== 'ISOLATED') return 0;
    const subaccount = childSubaccounts.find((c) => c.subaccountNumber === targetSubaccount);
    return subaccount ? parseFloat(subaccount.equity || '0') : 0;
  }, [marginMode, targetSubaccount, childSubaccounts]);

  const currentPercentage = useMemo(() => {
    if (!maxBuyingPower || maxBuyingPower <= 0 || !size) return 0;
    const sizeNum = parseFloat(size);
    if (isNaN(sizeNum) || sizeNum <= 0) return 0;
    let usdVal = sizeNum;
    if (currencyMode === 'BASE' && marketData?.oraclePrice) {
      usdVal = sizeNum * parseFloat(marketData.oraclePrice);
    }
    return Math.min(Math.round((usdVal / maxBuyingPower) * 100), 100);
  }, [maxBuyingPower, size, currencyMode, marketData?.oraclePrice]);

  const handlePercentageChange = (pct: number | string) => {
    if (!maxBuyingPower || maxBuyingPower <= 0) return;
    if (pct === '') {
      setSize('');
      return;
    }
    const pctNum = typeof pct === 'string' ? parseFloat(pct) : pct;
    if (isNaN(pctNum)) return;
    const validPct = Math.min(Math.max(pctNum, 0), 100);
    const usdVal = (validPct / 100) * maxBuyingPower;
    if (currencyMode === 'USD') {
      setSize(usdVal.toFixed(2));
    } else if (marketData?.oraclePrice && parseFloat(marketData.oraclePrice) > 0) {
      const baseAmount = usdVal / parseFloat(marketData.oraclePrice);
      const decimals = currencyService.getStepSizeDecimals(marketData.stepSize || '0.00000001');
      setSize(baseAmount.toFixed(decimals));
    }
  };

  const hasValidationErrors = !!(sizeError || priceError || triggerError || goodTilError);
  const isFormValid = !hasValidationErrors && !!size && canTrade;

  // ── CHAIN REJECTION NOTIFICATION (fixed) ──
  useEffect(() => {
    if (!selectedMarket) return;

    const recentRejections = recentlyTerminalOrders.filter((order: TrackedOrder) => {
      if (!order.ticker || order.ticker !== selectedMarket) return false;
      if (order.subaccountNumber !== undefined && order.subaccountNumber !== targetSubaccount) return false;

      return (
        order.status === 'REJECTED' ||
        (order.status === 'BEST_EFFORT_CANCELED' && order.removalReason)
      );
    });

    for (const order of recentRejections) {
      const key = `${order.id}-${order.status}`;
      if (shownRejectionsRef.current.has(key)) continue;

      shownRejectionsRef.current.add(key);

      let reason = order.removalReason || 'Unknown reason';
      if (reason.includes('UNDERCOLLATERALIZED')) reason = 'Undercollateralized';
      if (reason.includes('INSUFFICIENT_MARGIN')) reason = 'Insufficient Margin';

      addNotification(
        'error',
        `Order ${order.side} ${order.size} ${selectedMarket} was rejected on chain.\nReason: ${reason}`,
        'Order Rejected'
      );
    }
  }, [recentlyTerminalOrders, selectedMarket, targetSubaccount]);

  useEffect(() => {
    shownRejectionsRef.current.clear();
  }, [selectedMarket]);

  // Rest of your existing useEffects and functions (exactly same)
  useEffect(() => {
    if (leverage > maxLeverage) setLeverage(maxLeverage);
  }, [maxLeverage, leverage]);

  useEffect(() => {
    setSize('');
    setPrice('');
    setTriggerPrice('');
    if (showTpSl) {
      setTpPrice('');
      setSlPrice('');
    }
    const marketKey = selectedMarket ? `dydx_leverage_${selectedMarket}` : 'dydx_leverage';
    const saved = localStorage.getItem(marketKey) ?? localStorage.getItem('dydx_leverage');
    if (saved) {
      const parsed = parseFloat(saved);
      if (!isNaN(parsed)) setLeverage(parsed);
    }
  }, [selectedMarket]);

  useEffect(() => {
    if (selectedMarket) localStorage.setItem(`dydx_leverage_${selectedMarket}`, leverage.toString());
    localStorage.setItem('dydx_leverage', leverage.toString());
  }, [leverage, selectedMarket]);

  useEffect(() => {
    if (marketData?.oraclePrice && !price) {
      const oracle = parseFloat(marketData.oraclePrice);
      const tick = marketData.tickSize ? parseFloat(marketData.tickSize) : 0;
      if (tick > 0) {
        setPrice(roundToTickSize(oracle, tick).toFixed(getPriceDecimals(tick)));
      } else {
        setPrice(marketData.oraclePrice);
      }
    }
  }, [marketData?.oraclePrice, price, marketData?.tickSize]);

  useEffect(() => {
    if (orderError) {
      addNotification('error', orderError, 'Order Failed');
      clearOrderError();
    }
  }, [orderError, clearOrderError]);

  useEffect(() => {
    if (reduceOnly && (isLimit || isConditional) && (timeInForce === 'GTT' || timeInForce === 'POST_ONLY')) {
      setTimeInForce('IOC');
      addNotification('warning', 'Reduce-only orders must use IOC', 'Time-in-Force Changed');
    }
  }, [reduceOnly, isLimit, isConditional, timeInForce]);

  useEffect(() => {
    const handlePriceClick = (clickedPrice: string) => {
      if (PRICE_REQUIRED_TYPES.includes(orderType as any)) {
        setPrice(clickedPrice);
      } else if (TRIGGER_REQUIRED_TYPES.includes(orderType as any)) {
        if (!triggerPrice) setTriggerPrice(clickedPrice);
        else if (PRICE_REQUIRED_TYPES.includes(orderType as any) && !price) setPrice(clickedPrice);
      }
    };
    setOnPriceClick(handlePriceClick);
    return () => setOnPriceClick(null);
  }, [orderType, price, triggerPrice, setOnPriceClick]);

  useEffect(() => {
    if (size && marketData) {
      const validation = validateOrderSize(marketData, size, currencyMode, balance, leverage, orderType, marginMode);
      setSizeError(validation.isValid ? '' : validation.error || '');
      setSizeWarning(validation.warning || '');
    } else {
      setSizeError('');
      setSizeWarning('');
    }
  }, [size, marketData, currencyMode, balance, leverage, orderType, marginMode]);

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
    if ((isLimit || isConditional) && (timeInForce === 'GTT' || timeInForce === 'POST_ONLY')) {
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

    let finalPrice = PRICE_REQUIRED_TYPES.includes(orderType as any)
      ? parseFloat(price)
      : undefined;

    if (finalPrice !== undefined && marketData.tickSize) {
      const tickSize =
        typeof marketData.tickSize === 'string'
          ? parseFloat(marketData.tickSize)
          : marketData.tickSize;
      finalPrice = roundToTickSize(finalPrice, tickSize);
    }

    let finalTriggerPrice = TRIGGER_REQUIRED_TYPES.includes(orderType as any)
      ? parseFloat(triggerPrice)
      : undefined;

    if (finalTriggerPrice !== undefined && marketData.tickSize) {
      const tickSize =
        typeof marketData.tickSize === 'string'
          ? parseFloat(marketData.tickSize)
          : marketData.tickSize;
      finalTriggerPrice = roundToTickSize(finalTriggerPrice, tickSize);
    }

    let finalTpPrice = showTpSl && tpPrice ? parseFloat(tpPrice) : undefined;
    if (finalTpPrice !== undefined && marketData.tickSize) {
      const tickSize =
        typeof marketData.tickSize === 'string'
          ? parseFloat(marketData.tickSize)
          : marketData.tickSize;
      finalTpPrice = roundToTickSize(finalTpPrice, tickSize);
    }

    let finalSlPrice = showTpSl && slPrice ? parseFloat(slPrice) : undefined;
    if (finalSlPrice !== undefined && marketData.tickSize) {
      const tickSize =
        typeof marketData.tickSize === 'string'
          ? parseFloat(marketData.tickSize)
          : marketData.tickSize;
      finalSlPrice = roundToTickSize(finalSlPrice, tickSize);
    }

    let goodTilTimeInSeconds: number | undefined;
    if ((isLimit || isConditional) && (timeInForce === 'GTT' || timeInForce === 'POST_ONLY')) {
      goodTilTimeInSeconds = convertToSeconds(goodTilValue, goodTilUnit);
    }

    if (marginMode === 'ISOLATED') {
      const crossSub = childSubaccounts.find(c => c.subaccountNumber === 0);
      const crossFreeCollateral = crossSub ? parseFloat(crossSub.freeCollateral || '0') : 0;
      const oraclePrice = parseFloat(marketData?.oraclePrice || '0');
      const notionalValue = conversion.baseAmount * oraclePrice;

      const requiredMargin = notionalValue / leverage;

      const isLongTermOrder = orderType !== 'MARKET';
      const effectiveMargin = isLongTermOrder
        ? Math.max(requiredMargin, ISOLATED_EQUITY_TIER_MIN)
        : requiredMargin;

      const requiredMarginWithBuffer = effectiveMargin * 1.05;

      const totalAvailable = crossFreeCollateral + isolatedEquity;
      if (totalAvailable < requiredMarginWithBuffer) {
        addNotification(
          'error',
          isLongTermOrder
            ? `Insufficient collateral for isolated order. Requires $${requiredMarginWithBuffer.toFixed(2)} (incl. 5% buffer). Available: $${totalAvailable.toFixed(2)}`
            : `Insufficient collateral for isolated market order. Requires $${requiredMarginWithBuffer.toFixed(2)}. Available: $${totalAvailable.toFixed(2)}`,
          'Insufficient Margin'
        );
        return;
      }

      if (isolatedEquity < requiredMarginWithBuffer) {
        const autoDepositAmount = requiredMarginWithBuffer - isolatedEquity;
        addNotification(
          'info',
          `$${autoDepositAmount.toFixed(2)} will be auto-deposited from Cross Margin.`,
          'Auto-Deposit'
        );
      }
    }

    const result = await placeOrder(
      {
        market: selectedMarket,
        side,
        type: orderType,
        size: finalQuantity,
        price: finalPrice,
        triggerPrice: finalTriggerPrice,
        timeInForce: timeInForce === 'POST_ONLY' ? 'GTT' : timeInForce,
        reduceOnly,
        postOnly:
          timeInForce === 'POST_ONLY' &&
          (orderType === 'LIMIT' ||
            orderType === 'STOP_LIMIT' ||
            orderType === 'TAKE_PROFIT_LIMIT'),
        goodTilTimeInSeconds,
        subaccountNumber: targetSubaccount,
        leverage,
        takeProfitPrice: finalTpPrice,
        stopLossPrice: finalSlPrice,
      },
      pendingMarginRequired
    );

    if (result.success) {
      addNotification(
        'success',
        `${side} ${finalQuantity} ${marketData.baseAsset}`,
        'Order Placed'
      );
      setSize('');
      setPrice(marketData?.oraclePrice || '');
      setTriggerPrice('');
      if (showTpSl) {
        setTpPrice('');
        setSlPrice('');
      }
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
    <div className="flex flex-col max-w-lvw lg:max-w-[300px] h-[100svh] border-l border-color bg-secondary">
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

      <div className="hidden lg:block shrink-0">
        <DydxWalletConnect />
      </div>

      <div className="lg:hidden shrink-0 py-2 px-2 bg-primary">
        {balance ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-5">
              <div className="flex flex-col">
                <span className="text-[8px] uppercase tracking-wider text-gray-500">Portfolio</span>
                <span className="text-base text-sm font-semibold text-white">
                  ${Number(balance.totalEquity).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="w-px h-8 bg-gray-700/50" />
              <div className="flex flex-col">
                <span className="text-[8px] uppercase tracking-wider text-gray-500">Available</span>
                {pendingMarginRequired > 0 ? (
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-medium text-gray-400 line-through opacity-60">
                      ${Number(balance.freeCollateral).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    <span className="text-xs text-gray-400">→</span>
                    <span className="text-sm font-semibold text-emerald-400">
                      ${Math.max(0, Number(balance.freeCollateral) - pendingMarginRequired).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                ) : (
                  <span className="text-base text-sm font-semibold text-emerald-400">
                    ${Number(balance.freeCollateral).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between py-1">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-gray-700/50 flex items-center justify-center">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
              </div>
              <span className="text-xs text-gray-400">Connect wallet to trade</span>
            </div>
            <a href="https://trade.dydx.exchange/portfolio/deposit" target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 text-xs font-semibold rounded-lg transition-colors">
              Deposit
            </a>
          </div>
        )}
      </div>

      <div className="flex-shrink-0 space-y-2 pb-2 bg-secondary">
        <BuySellSelector selected={side} onChange={setSide} />
        <MarginTypeSelector
          selected={marginMode}
          onChange={setMarginMode}
          isolatedEquity={isolatedEquity}
          leverage={leverage}
          maxLeverage={maxLeverage}
          onLeverageChange={setLeverage}
          marketTicker={selectedMarket}
        />
        <OrderTypeSelector selected={orderType} onChange={setOrderType} />
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
        <div className="space-y-4">
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
            maxBuyingPower={maxBuyingPower}
            leverage={leverage}
            onSetMax={() => {
              if (maxBuyingPower) {
                if (currencyMode === 'USD') {
                  setSize(maxBuyingPower.toFixed(2));
                } else if (marketData?.oraclePrice && parseFloat(marketData.oraclePrice) > 0) {
                  const baseAmount = maxBuyingPower / parseFloat(marketData.oraclePrice);
                  const decimals = currencyService.getStepSizeDecimals(marketData.stepSize || '0.00000001');
                  setSize(baseAmount.toFixed(decimals));
                }
              }
            }}
          />

          <div className="px-1 lg:px-4 space-y-3 mt-4">
            <div className="flex items-center gap-4">
              <div className="relative flex-1 flex items-center h-6">
                <div className="absolute left-0 right-0 h-2 rounded-full pointer-events-none opacity-40"
                  style={{ backgroundImage: 'repeating-linear-gradient(to right, var(--color-text-muted), var(--color-text-muted) 3px, transparent 3px, transparent 6px)' }} />
                <div className="absolute left-0 h-2 bg-brand-primary rounded-l-full pointer-events-none transition-all duration-150 ease-out"
                  style={{ width: `${currentPercentage}%` }} />
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={currentPercentage}
                  onChange={e => handlePercentageChange(parseInt(e.target.value) || 0)}
                  className="absolute z-10 inset-0 w-full h-full appearance-none bg-transparent cursor-pointer [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:bg-secondary [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-4 [&::-webkit-slider-thumb]:border-brand-primary [&::-webkit-slider-thumb]:shadow-md hover:[&::-webkit-slider-thumb]:scale-110 [&::-webkit-slider-thumb]:transition-transform"
                />
              </div>

              <div className="relative w-16 group shrink-0">
                <div className="absolute inset-0 bg-tertiary rounded-lg border border-color pointer-events-none" />
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={(() => {
                    if (!size || isNaN(parseFloat(size)) || parseFloat(size) === 0) return '';
                    return currentPercentage;
                  })()}
                  onChange={e => handlePercentageChange(e.target.value)}
                  placeholder="0"
                  className="relative w-full bg-transparent text-primary rounded-lg pl-2 pr-5 py-2 text-sm font-semibold text-right focus:outline-none focus:ring-1 focus:ring-brand-primary/50 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none z-10"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted pointer-events-none z-20">%</span>
              </div>
            </div>
          </div>

          {orderType !== 'MARKET' && (
            <AdvancedOptions
              orderType={orderType}
              timeInForce={timeInForce}
              goodTilValue={goodTilValue}
              goodTilUnit={goodTilUnit}
              reduceOnly={reduceOnly}
              onTimeInForceChange={setTimeInForce}
              onGoodTilValueChange={setGoodTilValue}
              onGoodTilUnitChange={setGoodTilUnit}
              onReduceOnlyChange={setReduceOnly}
            />
          )}

          {orderType === 'MARKET' && (
            <div className="px-1 lg:px-4 mt-6">
              <label className="flex items-center gap-2 cursor-pointer group w-fit">
                <div className="relative flex items-center justify-center w-4 h-4 rounded border border-color bg-primary group-hover:border-brand-primary transition-colors mt-[1px]">
                  <input
                    type="checkbox"
                    checked={showTpSl}
                    onChange={e => setShowTpSl(e.target.checked)}
                    className="peer absolute inset-0 opacity-0 cursor-pointer"
                  />
                  <div className="absolute inset-0 bg-brand-primary rounded opacity-0 peer-checked:opacity-100 transition-opacity" />
                  <svg className="absolute w-3 h-3 text-white opacity-0 peer-checked:opacity-100 transition-opacity z-10" viewBox="0 0 12 12" fill="none">
                    <path d="M10 3L4.5 8.5L2 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <Tooltip content="Automatically close your position when it reaches a specific price" position="top">
                  <span className="text-[12px] font-medium text-primary group-hover:text-brand-primary transition-colors">
                    Take Profit / Stop Loss
                  </span>
                </Tooltip>
              </label>
            </div>
          )}

          {orderType === 'MARKET' && showTpSl && (
            <TpSlInputs
              side={side}
              entryPrice={parseFloat(marketData?.oraclePrice || '0')}
              tpPrice={tpPrice}
              slPrice={slPrice}
              onChangeTp={setTpPrice}
              onChangeSl={setSlPrice}
            />
          )}

          {goodTilError && <div className="text-xs text-red-500">{goodTilError}</div>}

          <OrderReceipt
            marketData={marketData}
            side={side}
            size={size}
            price={price}
            triggerPrice={triggerPrice}
            leverage={leverage}
            orderType={orderType}
            currencyMode={currencyMode}
            marginMode={marginMode}
            onPlaceOrder={handlePlaceOrder}
            isPlacingOrder={isPlacingOrder}
            isFormValid={isFormValid}
            selectedMarket={selectedMarket}
          />

          <div className="h-2" />
        </div>
      </div>
    </div>
  );
};