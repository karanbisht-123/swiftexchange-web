import React, { useEffect, useRef, useState, memo } from 'react';
import { LayoutList, PanelTop, PanelBottom, ChevronDown, ArrowDown, ArrowUp } from 'lucide-react';
import { useOrderbook } from '../../hooks/useOrderbook';
import { useTrades } from '../../hooks/useTrades';
import { useMarketStore } from '../../core/stores/marketStore';

interface OrderbookRowProps {
  price: number;
  size: number;
  cumTotal: number;
  maxCumTotal: number;
  maxRowSize: number;
  isAsk: boolean;
  formatPrice: (v: number) => string;
  formatSize: (v: number) => string;
}

import { useOrderEntryStore } from '../../core/stores/orderEntryStore';

const OrderbookRow = memo(function OrderbookRow({
  price,
  size,
  cumTotal,
  maxCumTotal,
  maxRowSize,
  isAsk,
  formatPrice,
  formatSize,
}: OrderbookRowProps) {
  const prevSizeRef = useRef(size);
  const sizeRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (prevSizeRef.current !== size && sizeRef.current) {
      const el = sizeRef.current;
      const flashClass = size > prevSizeRef.current ? 'size-flash-up' : 'size-flash-down';
      el.classList.remove('size-flash-up', 'size-flash-down');
      void el.offsetWidth;
      el.classList.add(flashClass);
      prevSizeRef.current = size;
      const t = setTimeout(() => el.classList.remove('size-flash-up', 'size-flash-down'), 450);
      return () => clearTimeout(t);
    }
  }, [size]);

  const depthPct = Math.min(100, (cumTotal / (maxCumTotal || 1)) * 100);
  const sizePct = Math.min(100, (size / (maxRowSize || 1)) * 100);

  return (
    <div 
      className="ob-row-enter flex justify-between items-center px-2 py-0.5   my-[1px] hover:bg-hover cursor-pointer relative leading-none shrink-0 group"
      onClick={() => useOrderEntryStore.getState().setPrice(price.toString())}
    >
      <div
        className={`absolute inset-y-0 right-0 pointer-events-none ob-depth-bar ${isAsk ? 'ob-depth-bar--ask-soft' : 'ob-depth-bar--bid-soft'}`}
        style={{ width: `${depthPct}%` }}
      />
      <div
        className={`absolute inset-y-0 right-0 pointer-events-none ob-depth-bar ${isAsk ? 'ob-depth-bar--ask-strong' : 'ob-depth-bar--bid-strong'}`}
        style={{ width: `${sizePct}%` }}
      />
      <span className={`font-mono-tabular text-[11px] font-medium z-10 ${isAsk ? 'text-danger' : 'text-success'}`}>
        {formatPrice(price)}
      </span>
      <div className="flex items-center z-10">
        <span ref={sizeRef} className="font-mono-tabular text-[11px] text-primary opacity-80 w-[72px] text-right">
          {formatSize(size)}
        </span>
        <span className="font-mono-tabular text-[11px] text-secondary w-[72px] text-right">
          {formatSize(cumTotal)}
        </span>
      </div>
    </div>
  );
});

function formatPrice(val: number): string {
  return val.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 4 });
}

function formatSize(val: number): string {
  if (val >= 1000) return val.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (val >= 1) return val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 3 });
  return val.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 5 });
}

function buildCumulative(levels: { price: string; size: string }[]) {
  let running = 0;
  return levels.map(l => {
    const sz = parseFloat(l.size);
    running += sz;
    return { price: parseFloat(l.price), size: sz, cumTotal: running };
  });
}

export const OrderbookPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'Book' | 'Trades'>('Book');
  const [viewMode, setViewMode] = useState<'both' | 'bids' | 'asks'>('both');
  const orderbook = useOrderbook();
  const trades = useTrades();
  const symbol = useMarketStore((state) => state.selectedSymbol);
  const [base, quote] = symbol.split('-');

  const rowsPerSide = viewMode === 'both' ? 13 : 40;

  const rawAsks = (orderbook.asks || []).slice(0, viewMode === 'bids' ? 0 : rowsPerSide);
  const rawBids = (orderbook.bids || []).slice(0, viewMode === 'asks' ? 0 : rowsPerSide);

  // Cumulative totals build from mid outward
  const askRows = buildCumulative(rawAsks).reverse();
  const bidRows = buildCumulative(rawBids);

  const maxAskCum = askRows.length > 0 ? askRows[0].cumTotal : 1;
  const maxBidCum = bidRows.length > 0 ? bidRows[bidRows.length - 1].cumTotal : 1;
  const maxCumTotal = Math.max(maxAskCum, maxBidCum, 1);

  const maxRowSize = Math.max(
    ...askRows.map(r => r.size),
    ...bidRows.map(r => r.size),
    1
  );
  const lowestAsk = orderbook.asks?.[0] ? parseFloat(orderbook.asks[0].price) : 0;
  const highestBid = orderbook.bids?.[0] ? parseFloat(orderbook.bids[0].price) : 0;
  const spread = lowestAsk > 0 && highestBid > 0 ? lowestAsk - highestBid : 0;
  const spreadPct = lowestAsk > 0 ? (spread / lowestAsk) * 100 : 0;

  const TabBtn = ({ id, label }: { id: 'Book' | 'Trades'; label: string }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`flex-1 py-2.5 text-center text-[12px] font-medium transition-colors ${activeTab === id ? 'text-primary border-b-2 border-brand' : 'text-secondary hover:text-primary'
        }`}
    >
      {label}
    </button>
  );

  const ViewBtn = ({
    mode,
    title,
    icon,
    activeColor,
  }: {
    mode: 'both' | 'bids' | 'asks';
    title: string;
    icon: React.ReactNode;
    activeColor: string;
  }) => (
    <button
      onClick={() => setViewMode(mode)}
      title={title}
      className={`flex items-center justify-center w-[22px] h-[22px] rounded transition-colors ${viewMode === mode ? activeColor : 'text-muted hover:text-primary hover:bg-hover'
        }`}
    >
      {icon}
    </button>
  );

  return (
    <div className="w-[300px] shrink-0 bg-secondary border border-color rounded-lg overflow-hidden flex flex-col h-full">
      {/* Tab Header */}
      <div className="flex border-b border-color shrink-0">
        <TabBtn id="Book" label="Order Book" />
        <TabBtn id="Trades" label="Trades" />
      </div>

      {/* Controls Row */}
      <div className="flex items-center justify-between px-3 py-[6px] border-b border-color shrink-0">
        <div className="flex items-center gap-1.5">
          <ViewBtn
            mode="both"
            title="Both"
            activeColor="text-brand bg-brand/10"
            icon={<LayoutList size={12} strokeWidth={2} />}
          />
          <ViewBtn
            mode="bids"
            title="Bids only"
            activeColor="text-success bg-success/10"
            icon={<PanelBottom size={12} strokeWidth={2} />}
          />
          <ViewBtn
            mode="asks"
            title="Asks only"
            activeColor="text-danger bg-danger/10"
            icon={<PanelTop size={12} strokeWidth={2} />}
          />
        </div>
        <div className="flex items-center gap-1 text-[11px] text-muted font-medium">
          <button className="flex items-center gap-0.5 hover:text-primary transition-colors">
            0.1 <ChevronDown size={10} strokeWidth={2.5} />
          </button>
          <span className="text-secondary ml-1">{base}</span>
        </div>
      </div>

      {activeTab === 'Book' ? (
        <>
          {/* Column Headers */}
          <div className="flex items-center justify-between px-3 py-[5px] text-[10px] text-muted font-medium shrink-0">
            <span>Price({quote})</span>
            <div className="flex">
              <span className="w-[72px] text-right">Size({base})</span>
              <span className="w-[72px] text-right">Total({base})</span>
            </div>
          </div>

          <div className="flex-1 flex flex-col overflow-hidden">
            {viewMode !== 'bids' && (
              <div className={`flex flex-col ${viewMode === 'both' ? 'flex-1 justify-end overflow-hidden' : 'flex-1 ob-scroll overflow-y-auto'} pb-0.5`}>
                {askRows.length === 0 ? (
                  <div className="text-center text-muted py-6 text-[11px]">Waiting for data…</div>
                ) : (
                  askRows.map(row => (
                    <OrderbookRow
                      key={`ask-${row.price}`}
                      price={row.price}
                      size={row.size}
                      cumTotal={row.cumTotal}
                      maxCumTotal={maxCumTotal}
                      maxRowSize={maxRowSize}
                      isAsk={true}
                      formatPrice={formatPrice}
                      formatSize={formatSize}
                    />
                  ))
                )}
              </div>
            )}

            {/* Spread Row */}
            <div className="flex items-center justify-between px-2 py-1 border-y border-color shrink-0">
              <div className="flex items-center gap-1.5">
                <span className="font-mono-tabular text-[13px] font-bold text-danger">
                  {lowestAsk > 0 ? formatPrice(lowestAsk) : '—'}
                </span>
                {spread > 0 && (
                  <ArrowDown size={11} strokeWidth={2.5} className="text-danger opacity-70" />
                )}
              </div>
              <div className="flex items-center gap-2 text-[10px]">
                <span className="text-muted">Spread</span>
                <span className="font-mono-tabular text-primary font-medium">{spreadPct.toFixed(3)}%</span>
              </div>
            </div>

            {viewMode !== 'asks' && (
              <div className={`flex flex-col ${viewMode === 'both' ? 'flex-1 overflow-hidden' : 'flex-1 ob-scroll overflow-y-auto'} pt-0.5`}>
                {bidRows.length === 0 ? (
                  <div className="text-center text-muted py-6 text-[11px]">Waiting for data…</div>
                ) : (
                  bidRows.map(row => (
                    <OrderbookRow
                      key={`bid-${row.price}`}
                      price={row.price}
                      size={row.size}
                      cumTotal={row.cumTotal}
                      maxCumTotal={maxCumTotal}
                      maxRowSize={maxRowSize}
                      isAsk={false}
                      formatPrice={formatPrice}
                      formatSize={formatSize}
                    />
                  ))
                )}
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          {/* Trades Column Headers */}
          <div className="flex items-center justify-between px-3 py-[5px] text-[10px] text-muted font-medium shrink-0">
            <span>Price({quote})</span>
            <div className="flex">
              <span className="w-[72px] text-right">Size({base})</span>
              <span className="w-[72px] text-right">Time</span>
            </div>
          </div>

          <div className="flex-1 ob-scroll overflow-y-auto">
            {trades.length === 0 ? (
              <div className="text-center text-muted py-8 text-[11px]">Waiting for trades…</div>
            ) : (
              <div>
                {trades.map(trade => {
                  const px = parseFloat(trade.price);
                  const sz = parseFloat(trade.size);
                  const isBuy = trade.side === 'buy';
                  const d = new Date(trade.timestamp);
                  const t = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;

                  return (
                    <div
                      key={trade.id}
                      className="trade-row-enter flex justify-between items-center px-3 py-[3.5px] hover:bg-hover cursor-pointer leading-none"
                      onClick={() => useOrderEntryStore.getState().setPrice(px.toString())}
                    >
                      <div className="flex items-center gap-1">
                        {isBuy
                          ? <ArrowUp size={9} strokeWidth={2.5} className="text-success shrink-0" />
                          : <ArrowDown size={9} strokeWidth={2.5} className="text-danger shrink-0" />
                        }
                        <span className={`font-mono-tabular text-[11px] font-medium ${isBuy ? 'text-success' : 'text-danger'}`}>
                          {formatPrice(px)}
                        </span>
                      </div>
                      <div className="flex">
                        <span className="font-mono-tabular text-[11px] text-primary opacity-80 w-[72px] text-right">
                          {formatSize(sz)}
                        </span>
                        <span className="font-mono-tabular text-[11px] text-secondary w-[72px] text-right">
                          {t}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
