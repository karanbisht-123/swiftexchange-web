import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useTrades } from '../../../hooks/useTrades';
import type { MarketData, OrderSideEnum, OrderTypeEnum } from '../../../types/trading.types';

interface OrderReceiptProps {
    marketData: MarketData | null;
    side: OrderSideEnum;
    size: string;
    price: string;
    triggerPrice: string;
    leverage: number;
    orderType: OrderTypeEnum;
}

export const OrderReceipt: React.FC<OrderReceiptProps> = ({
    marketData,
    side,
    size,
    price,
    leverage,
    orderType,
}) => {
    const [isExpanded, setIsExpanded] = useState(true);
    const { livePrice } = useTrades(marketData?.ticker || '', 50);

    const calculations = useMemo(() => {
        if (!marketData || !size) return null;

        const sizeNum = parseFloat(size);
        if (isNaN(sizeNum) || sizeNum <= 0) return null;

        let executionPrice = 0;
        const oraclePrice = parseFloat(marketData.oraclePrice);
        const currentPrice = livePrice && livePrice > 0 ? livePrice : oraclePrice;

        if (orderType === 'MARKET' || orderType === 'STOP_MARKET' || orderType === 'TAKE_PROFIT_MARKET') {
            executionPrice = currentPrice;
        } else {
            const priceNum = parseFloat(price);
            executionPrice = isNaN(priceNum) ? currentPrice : priceNum;
        }

        const notional = sizeNum * executionPrice;
        const positionMargin = notional / leverage;

        const isMaker = orderType === 'LIMIT' || orderType === 'STOP_LIMIT' || orderType === 'TAKE_PROFIT_LIMIT';
        const feeRate = marketData.zeroFees ? 0 : (isMaker ? 0.0002 : 0.0005);
        const fee = notional * feeRate;

        const mmf = parseFloat(marketData.maintenanceMarginFraction || '0.03');
        let liquidationPrice = 0;

        if (side === 'BUY') {
            liquidationPrice = executionPrice * (1 - 1 / leverage) / (1 - mmf);
        } else {
            liquidationPrice = executionPrice * (1 + 1 / leverage) / (1 + mmf);
        }

        liquidationPrice = Math.max(0, liquidationPrice);

        return {
            expectedPrice: executionPrice,
            positionMargin,
            liquidationPrice,
            fee,
            feeRate
        };
    }, [marketData, size, price, leverage, orderType, side, livePrice]);

    if (!calculations) return null;

    return (
        <div className="border border-gray-800 rounded-lg bg-gray-900/40 overflow-hidden mb-4 rounded-b-none">
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center justify-between p-3 text-xs font-medium text-gray-400 hover:text-gray-300 transition-colors bg-gray-900/20"
            >
                <span>Receipt</span>
                {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {isExpanded && (
                <div className="px-3 pb-3 space-y-3 bg-gray-900/20 pt-2">
                    <Row
                        label="Expected Price"
                        value={`$${calculations.expectedPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                    />
                    <Row
                        label="Liquidation Price"
                        value={`$${calculations.liquidationPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                    />
                    <Row
                        label="Position Margin"
                        value={`$${calculations.positionMargin.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                    />
                    <Row
                        label="Fee"
                        value={marketData?.zeroFees ? 'No Fees' : `$${calculations.fee.toFixed(2)}`}
                        isBadge={!!marketData?.zeroFees}
                    />
                    <Row
                        label="Rewards"
                        value="DYDX"
                        rightElement={<span className="text-[10px] bg-indigo-500/20 text-indigo-400 px-1 rounded ml-1 font-semibold">New</span>}
                    />
                </div>
            )}
        </div>
    );
};

const Row: React.FC<{ label: string; value: string; isBadge?: boolean; rightElement?: React.ReactNode }> = ({ label, value, isBadge, rightElement }) => (
    <div className="flex justify-between items-center text-xs">
        <span className="text-gray-500 border-b border-dashed border-gray-700/50 pb-0.5 cursor-help">{label}</span>
        <div className="flex items-center">
            {isBadge ? (
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">{value}</span>
            ) : (
                <span className="text-gray-200 font-medium">{value}</span>
            )}
            {rightElement}
        </div>
    </div>
);
