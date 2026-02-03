import { CheckCircle, Clock, Copy, XCircle } from 'lucide-react';
import React, { useCallback, useState } from 'react';

import { type Order } from '../../service/dydxOrderService';
import { getTimeAgo } from '../../utils/timeUtils';
import { MarketBadge } from './MarketBadge';

interface OrderDetailPanelProps {
    order: Order;
}

export const OrderDetailPanel: React.FC<OrderDetailPanelProps> = ({ order }) => {
    const [copied, setCopied] = useState(false);

    const filled = parseFloat(order.totalFilled || '0');
    const size = parseFloat(order.size);
    const fillPercent = size > 0 ? (filled / size) * 100 : 0;
    const remaining = size - filled;
    const price = parseFloat(order.price);
    const filledValue = filled * price;

    const copyToClipboard = useCallback((text: string) => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }, []);

    const getStatusDisplay = () => {
        switch (order.status) {
            case 'OPEN':
                return (
                    <div className="flex items-center gap-2 text-green-400">
                        <CheckCircle size={16} />
                        <span>Open</span>
                    </div>
                );
            case 'FILLED':
                return (
                    <div className="flex items-center gap-2 text-blue-400">
                        <CheckCircle size={16} />
                        <span>Filled</span>
                    </div>
                );
            case 'CANCELED':
            case 'BEST_EFFORT_CANCELED':
                return (
                    <div className="flex items-center gap-2 text-red-400">
                        <XCircle size={16} />
                        <span>Canceled</span>
                    </div>
                );
            case 'PARTIALLY_FILLED':
                return (
                    <div className="flex items-center gap-2 text-yellow-400">
                        <Clock size={16} />
                        <span>Partially Filled</span>
                    </div>
                );
            case 'BEST_EFFORT_OPENED':
                return (
                    <div className="flex items-center gap-2 text-yellow-400">
                        <Clock size={16} className="animate-spin" />
                        <span>Pending</span>
                    </div>
                );
            case 'UNTRIGGERED':
                return (
                    <div className="flex items-center gap-2 text-purple-400">
                        <Clock size={16} />
                        <span>Awaiting Trigger</span>
                    </div>
                );
            default:
                return <span className="text-muted">{order.status}</span>;
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <MarketBadge market={order.ticker} />
                {getStatusDisplay()}
            </div>

            <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <DetailItem label="Side">
                        <span
                            className={`px-2 py-1 rounded text-xs font-bold ${order.side === 'BUY'
                                    ? 'bg-green-500/20 text-green-400'
                                    : 'bg-red-500/20 text-red-400'
                                }`}
                        >
                            {order.side}
                        </span>
                    </DetailItem>

                    <DetailItem label="Type">
                        <span className="px-2 py-1 bg-secondary text-primary rounded text-xs">
                            {order.type}
                        </span>
                    </DetailItem>
                </div>

                <div className="h-px bg-color" />

                <div className="grid grid-cols-2 gap-4">
                    <DetailItem label="Amount">
                        <span className="text-primary font-mono">{size.toFixed(4)}</span>
                    </DetailItem>

                    <DetailItem label="Filled">
                        <div className="text-right">
                            <span className="text-primary font-mono">{filled.toFixed(4)}</span>
                            {fillPercent > 0 && (
                                <span className="text-muted text-xs ml-1">({fillPercent.toFixed(1)}%)</span>
                            )}
                        </div>
                    </DetailItem>

                    <DetailItem label="Remaining">
                        <span className="text-primary font-mono">{remaining.toFixed(4)}</span>
                    </DetailItem>

                    <DetailItem label="Price">
                        <span className="text-primary font-mono">
                            {order.type === 'MARKET' ? 'Market' : `$${price.toLocaleString()}`}
                        </span>
                    </DetailItem>
                </div>

                <div className="h-px bg-color" />

                <div className="grid grid-cols-2 gap-4">
                    <DetailItem label="Filled Value">
                        <span className="text-primary font-mono">${filledValue.toLocaleString()}</span>
                    </DetailItem>

                    <DetailItem label="Time in Force">
                        <span className="text-primary">{order.timeInForce || 'GTT'}</span>
                    </DetailItem>
                </div>

                <div className="h-px bg-color" />

                <div className="space-y-3">
                    <DetailItem label="Created">
                        <span className="text-muted">
                            {order.updatedAt ? getTimeAgo(order.updatedAt) : order.createdAtHeight}
                        </span>
                    </DetailItem>

                    <DetailItem label="Order ID">
                        <div className="flex items-center gap-2">
                            <span className="text-muted text-xs font-mono truncate max-w-[150px]">
                                {order.id}
                            </span>
                            <button
                                onClick={() => copyToClipboard(order.id)}
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

export default OrderDetailPanel;
