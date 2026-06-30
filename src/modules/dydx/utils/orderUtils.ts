interface OrderLike {
    clientMetadata?: string | number;
    type?: string;
}
export const getDisplayOrderType = (order: OrderLike): string => {
    if (!order) return '—';
    if (
        (order.clientMetadata === '1' || order.clientMetadata === 1) &&
        order.type === 'LIMIT'
    ) {
        return 'MARKET';
    }
    return order.type ?? '—';
};

export const isMarketOrderType = (order: OrderLike): boolean =>
    getDisplayOrderType(order) === 'MARKET';

export interface PnlResult {
    text: string;
    className: string;
}

interface FillLike {
    positionSideBefore?: string | null;
    positionSizeBefore?: string | null;
    entryPriceBefore?: string | null;
    price: string;
    size: string;
    side: string;
}

export const computeClosedPnl = (fill: FillLike): PnlResult | null => {
    if (
        !fill.positionSideBefore ||
        !fill.positionSizeBefore ||
        !fill.entryPriceBefore
    ) {
        return null;
    }

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

    if (closedPnl === null) return null;

    const isNegative = closedPnl < 0;
    const absValue = Math.abs(closedPnl);
    return {
        text: isNegative ? `-$${absValue.toFixed(2)}` : `$${absValue.toFixed(2)}`,
        className: isNegative
            ? 'text-red-400'
            : closedPnl > 0
                ? 'text-green-400'
                : 'text-primary',
    };
};

export const copyToClipboard = async (text: string): Promise<boolean> => {
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch {
        // fall through to legacy path
    }

    try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        textarea.style.pointerEvents = 'none';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(textarea);
        return ok;
    } catch {
        return false;
    }
};


export interface TimeAgoOptions {
    shortForm?: boolean;
}

export const formatTimeAgo = (
    input: string | number | Date,
    _opts: TimeAgoOptions = {},
): string => {
    if (!input) return '—';
    const date = input instanceof Date ? input : new Date(input);
    if (Number.isNaN(date.getTime())) return '—';

    const diff = Date.now() - date.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const weeks = Math.floor(days / 7);

    if (seconds < 60) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    if (weeks < 5) return `${weeks}w ago`;
    return date.toLocaleDateString();
};

export const formatTimeAgoCompact = (
    input: string | number | Date,
): string => {
    if (!input) return '';
    const date = input instanceof Date ? input : new Date(input);
    if (Number.isNaN(date.getTime())) return '';

    const diff = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diff < 60) return `${diff}s`;
    const minutes = Math.floor(diff / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d`;
    const weeks = Math.floor(days / 7);
    return `${weeks}w`;
};

export const capitalizeFirst = (str: string | null | undefined): string => {
    if (!str) return '—';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

export const WS_FRESHNESS_MS = 30_000;
export const CANCEL_REFRESH_DELAY_MS = 1_500;
export const STALE_TICK_INTERVAL_MS = 5_000;








