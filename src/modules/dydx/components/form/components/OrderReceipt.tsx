import { ChevronDown, ChevronUp } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';

import { Tooltip } from '../../../../../components/common/Tooltip';
import { useDydxWallet } from '../../../hooks/useDydxWallet';
import { useTrades } from '../../../hooks/useTrades';
import useOrderPreviewStore from '../../../store/orderPreviewStore';
import type { MarketData, OrderSideEnum, OrderTypeEnum } from '../../../types/trading.types';
import type { CurrencyMode } from '../../../utils/currencyService';
import {
  calculateCrossLiquidationPrice,
  calculateIsolatedLiquidationPrice,
} from '../../../utils/marginCalculator';

interface OrderReceiptProps {
  marketData: MarketData | null;
  side: OrderSideEnum;
  size: string;
  price: string;
  triggerPrice: string;
  leverage: number;
  orderType: OrderTypeEnum;
  currencyMode: CurrencyMode;
  marginMode: 'CROSS' | 'ISOLATED';
  onPlaceOrder: () => void;
  isPlacingOrder: boolean;
  isFormValid: boolean;
  selectedMarket: string;
}

export const OrderReceipt: React.FC<OrderReceiptProps> = ({
  marketData,
  side,
  size,
  price,
  leverage,
  orderType,
  currencyMode,
  marginMode,
  onPlaceOrder,
  isPlacingOrder,
  isFormValid,
  selectedMarket,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const { livePrice } = useTrades(selectedMarket, 50);
  const { balance } = useDydxWallet();

  const calculations = useMemo(() => {
    if (!marketData || !size) return null;

    const sizeNum = parseFloat(size);
    if (isNaN(sizeNum) || sizeNum <= 0) return null;

    const oraclePrice = parseFloat(marketData.oraclePrice);
    const currentPrice = livePrice && livePrice > 0 ? livePrice : oraclePrice;

    let executionPrice = 0;
    if (
      orderType === 'MARKET' ||
      orderType === 'STOP_MARKET' ||
      orderType === 'TAKE_PROFIT_MARKET'
    ) {
      executionPrice = currentPrice;
    } else {
      const priceNum = parseFloat(price);
      executionPrice = isNaN(priceNum) ? currentPrice : priceNum;
    }

    let baseSize = sizeNum;
    if (currencyMode === 'USD') {
      baseSize = executionPrice > 0 ? sizeNum / executionPrice : 0;
    }

    if (baseSize <= 0) return null;

    const notional = Math.abs(baseSize * executionPrice);

    const imf = parseFloat(marketData.initialMarginFraction || '0.05');
    const mmf = parseFloat(marketData.maintenanceMarginFraction || '0.03');
    const maxLeverage = imf > 0 ? 1 / imf : 20;

    const storedLeverage = (() => {
      const raw =
        localStorage.getItem(`dydx_leverage_${selectedMarket}`) ??
        localStorage.getItem('dydx_leverage');
      const parsed = raw ? parseFloat(raw) : 0;
      return parsed > 0 ? parsed : 0;
    })();

    const accountEquity = balance ? parseFloat(balance.equity) : 0;

    const effectiveLeverage = Math.min(
      leverage > 0 ? leverage : storedLeverage > 0 ? storedLeverage : maxLeverage,
      maxLeverage
    );

    const initialMarginRequired = notional / effectiveLeverage;

    const isMaker =
      orderType === 'LIMIT' || orderType === 'STOP_LIMIT' || orderType === 'TAKE_PROFIT_LIMIT';
    const feeRate = marketData.zeroFees ? 0 : isMaker ? 0.0002 : 0.0005;
    const fee = notional * feeRate;

    let liquidationPrice = 0;
    if (marginMode === 'ISOLATED') {
      liquidationPrice = calculateIsolatedLiquidationPrice(
        baseSize,
        executionPrice,
        initialMarginRequired,
        mmf,
        side
      );
    } else {
      const equity = accountEquity > 0 ? accountEquity : initialMarginRequired;
      liquidationPrice = calculateCrossLiquidationPrice(
        baseSize,
        executionPrice,
        equity,
        mmf,
        0,
        side
      );
    }

    return {
      expectedPrice: executionPrice,
      initialMarginRequired,
      liquidationPrice,
      fee,
      feeRate,
      imf,
      leverage: effectiveLeverage,
    };
  }, [
    marketData,
    size,
    price,
    leverage,
    orderType,
    side,
    livePrice,
    currencyMode,
    marginMode,
    balance,
    selectedMarket,
  ]);

  useEffect(() => {
    const { setPendingMargin, clearPendingMargin } = useOrderPreviewStore.getState();
    if (calculations) {
      setPendingMargin(calculations.initialMarginRequired);
    } else {
      clearPendingMargin();
    }
  }, [calculations]);

  const marginLabel = marginMode === 'ISOLATED' ? 'Req. Collateral' : 'Position Margin';
  const marginTooltip =
    marginMode === 'ISOLATED'
      ? 'The exact amount of collateral locked for this position'
      : 'The initial margin required to open this position';

  return (
    <div className="flex flex-col px-2">
      {calculations && (
        <div className=" rounded-lg rounded-b-none bg-secondary overflow-hidden border border-color border-b-0">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full flex items-center justify-between p-3 text-xs font-medium text-muted hover:text-primary transition-colors bg-primary"
          >
            <span>Receipt</span>
            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {isExpanded && (
            <div className="px-3 pb-3 space-y-3  pt-2">
              <Row
                label="Expected Price"
                value={`$${calculations.expectedPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                tooltip="The price at which this order is expected to fill"
              />
              <Row
                label="Liquidation Price"
                value={`→ $${calculations.liquidationPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                tooltip="Price at which your position will be liquidated"
              />
              <Row
                label={marginLabel}
                value={`→ $${calculations.initialMarginRequired.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                tooltip={marginTooltip}
              />
              <Row
                label="Fee"
                value={marketData?.zeroFees ? 'No Fees' : `$${calculations.fee.toFixed(2)}`}
                isBadge={!!marketData?.zeroFees}
                tooltip="Estimated trading fee for this order"
              />
              <Row
                label="Rewards"
                value="DYDX"
                rightElement={
                  <span className="text-[10px] bg-info/20 text-info px-1 rounded ml-1 font-semibold">
                    New
                  </span>
                }
                tooltip="Estimated trading rewards"
              />
            </div>
          )}
        </div>
      )}

      <button
        onClick={onPlaceOrder}
        disabled={isPlacingOrder || !isFormValid}
        className={`w-full py-4 rounded-lg -mt-2 z-20 font-bold text-sm transition-all
                ${
                  side === 'BUY'
                    ? 'bg-success hover:bg-success/90 active:bg-success/80'
                    : 'bg-danger hover:bg-danger/90 active:bg-danger/80'
                } disabled:opacity-50 disabled:cursor-not-allowed text-white shadow-lg`}
      >
        {isPlacingOrder ? 'Placing Order...' : `${side} ${selectedMarket || ''}`}
      </button>
    </div>
  );
};

const Row: React.FC<{
  label: string;
  value: string;
  isBadge?: boolean;
  rightElement?: React.ReactNode;
  tooltip?: string;
}> = ({ label, value, isBadge, rightElement, tooltip }) => (
  <div className="flex justify-between items-center text-xs">
    <Tooltip content={tooltip || ''} position="top">
      <span className="text-muted">{label}</span>
    </Tooltip>
    <div className="flex items-center">
      {isBadge ? (
        <span className="px-1.5 py-0.5 rounded text-[10px] bg-success/10 text-success border border-success/20">
          {value}
        </span>
      ) : (
        <span className="text-primary font-medium">{value}</span>
      )}
      {rightElement}
    </div>
  </div>
);
