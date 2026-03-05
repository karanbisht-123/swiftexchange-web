import { CheckCircle, Copy } from 'lucide-react';
import React, { useCallback, useState } from 'react';

import { type Fill } from '../../service/dydxOrderService';
import { formatTime, getTimeAgo } from '../../utils/timeUtils';
import { MarketBadge } from './MarketBadge';

interface FillDetailPanelProps {
    fill: Fill;
}

export const FillDetailPanel: React.FC<FillDetailPanelProps> = ({ fill }) => {
    const [copied, setCopied] = useState(false);

    const size = parseFloat(fill.size);
    const price = parseFloat(fill.price);
    const total = size * price;
    const fee = Math.abs(parseFloat(fill.fee));

    let closedPnlStr = '—';
    let pnlClass = 'text-primary';

    if (fill.positionSideBefore && fill.positionSizeBefore && fill.entryPriceBefore) {
        const sizeBefore = parseFloat(fill.positionSizeBefore);
        const entryPrice = parseFloat(fill.entryPriceBefore);
        const fillPrice = parseFloat(fill.price);
        const fillSize = parseFloat(fill.size);

        let closedPnl: number | null = null;

        if (fill.positionSideBefore === 'LONG' && fill.side === 'SELL') {
            const sizeClosed = Math.min(sizeBefore, fillSize);
            closedPnl = (fillPrice - entryPrice) * sizeClosed;
        } else if (fill.positionSideBefore === 'SHORT' && fill.side === 'BUY') {
            const sizeClosed = Math.min(sizeBefore, fillSize);
            closedPnl = (entryPrice - fillPrice) * sizeClosed;
        }

        if (closedPnl !== null) {
            const isNegative = closedPnl < 0;
            const absValue = Math.abs(closedPnl);
            closedPnlStr = isNegative ? `-$${absValue.toFixed(2)}` : `$${absValue.toFixed(2)}`;
            pnlClass = isNegative ? 'text-red-400' : closedPnl > 0 ? 'text-green-400' : 'text-primary';
        }
    }

    const copyToClipboard = useCallback((text: string) => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }, []);

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <MarketBadge market={fill.market || (fill as any).ticker} />
                <span
                    className={`px-2 py-1 rounded text-xs font-bold ${fill.side === 'BUY'
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-red-500/20 text-red-400'
                        }`}
                >
                    {fill.side}
                </span>
            </div>

            <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <DetailItem label="Type">
                        <span className="px-2 py-1 bg-secondary text-primary rounded text-xs">
                            {fill.type}
                        </span>
                    </DetailItem>

                    <DetailItem label="Liquidity">
                        <span
                            className={`px-2 py-1 rounded text-xs font-medium ${fill.liquidity === 'MAKER'
                                ? 'bg-blue-500/20 text-blue-400'
                                : 'bg-purple-500/20 text-purple-400'
                                }`}
                        >
                            {fill.liquidity}
                        </span>
                    </DetailItem>
                </div>

                <div className="h-px bg-color" />

                <div className="grid grid-cols-2 gap-4">
                    <DetailItem label="Amount">
                        <span className="text-primary font-mono">{size.toFixed(4)}</span>
                    </DetailItem>

                    <DetailItem label="Price">
                        <span className="text-primary font-mono">${price.toLocaleString()}</span>
                    </DetailItem>

                    <DetailItem label="Total">
                        <span className="text-primary font-mono font-semibold">
                            ${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                    </DetailItem>

                    <DetailItem label="Fee">
                        <span className="text-red-400 font-mono">${fee.toFixed(4)}</span>
                    </DetailItem>

                    <DetailItem label="Closed PNL">
                        <span className={`font-mono ${pnlClass}`}>{closedPnlStr}</span>
                    </DetailItem>
                </div>

                <div className="h-px bg-color" />

                <div className="space-y-3">
                    <DetailItem label="Time">
                        <div className="flex flex-col">
                            <span className="text-primary text-xs">{formatTime(fill.createdAt)}</span>
                            <span className="text-muted text-xs">{getTimeAgo(fill.createdAt)}</span>
                        </div>
                    </DetailItem>

                    <DetailItem label="Fill ID">
                        <div className="flex items-center gap-2">
                            <span className="text-muted text-xs font-mono truncate max-w-[150px]">
                                {fill.id}
                            </span>
                            <button
                                onClick={() => copyToClipboard(fill.id)}
                                className="p-1 hover:bg-hover rounded transition-colors"
                            >
                                {copied ? (
                                    <CheckCircle size={14} className="text-green-400" />
                                ) : (
                                    <Copy size={14} className="text-muted" />
                                )}
                            </button>
                        </div>
                    </DetailItem>

                    {fill.orderId && (
                        <DetailItem label="Order ID">
                            <span className="text-muted text-xs font-mono truncate">
                                {fill.orderId}
                            </span>
                        </DetailItem>
                    )}
                </div>
            </div>
        </div>
    );
};

const DetailItem: React.FC<{ label: string; children: React.ReactNode }> = ({
    label,
    children,
}) => (
    <div className="flex flex-col gap-1">
        <span className="text-muted text-xs uppercase tracking-wide">{label}</span>
        <div className="text-sm">{children}</div>
    </div>
);

export default FillDetailPanel;
