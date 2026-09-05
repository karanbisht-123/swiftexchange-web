import React from 'react';

import { marketStore } from '../../core/stores/marketStore';
import { useOrderbook } from '../../hooks/useOrderbook';

export const ExchangeMiddlePanel: React.FC = () => {
  const orderbook = useOrderbook();
  const symbol = marketStore.getSelectedSymbol();
  const [base, quote] = symbol.split('-');

  const asks = (orderbook?.asks || []).slice(0, 20).reverse();
  const bids = (orderbook?.bids || []).slice(0, 20);

  let maxSize = 1;
  asks.forEach(a => (maxSize = Math.max(maxSize, parseFloat(a.size))));
  bids.forEach(b => (maxSize = Math.max(maxSize, parseFloat(b.size))));

  const lowestAsk = asks.length > 0 ? parseFloat(asks[asks.length - 1].price) : 0;
  const highestBid = bids.length > 0 ? parseFloat(bids[0].price) : 0;

  let spread = 0;
  let spreadPercent = 0;
  if (lowestAsk > 0 && highestBid > 0) {
    spread = lowestAsk - highestBid;
    spreadPercent = (spread / lowestAsk) * 100;
  }

  // Format currency
  const formatCurrency = (val: number, isSize: boolean = false) => {
    return val.toLocaleString('en-US', {
      minimumFractionDigits: isSize ? 2 : 4,
      maximumFractionDigits: isSize ? 2 : 4,
    });
  };

  return (
    <div className="w-[300px] shrink-0 bg-secondary border border-color rounded-md overflow-hidden flex flex-col h-full">
      <div className="flex items-center gap-6 px-4 h-10 border-b border-color text-[11px] text-secondary shrink-0">
        <button className="text-primary font-medium border-b-2 border-brand h-full px-1">
          Book
        </button>
        <button className="hover:text-primary h-full px-1">Trades</button>
      </div>

      <div className="flex items-center justify-between px-4 py-2 border-b border-color text-[11px] text-muted shrink-0">
        <div className="flex items-center gap-1.5">
          <button className="w-5 h-5 rounded bg-tertiary flex items-center justify-center hover:bg-hover">
            -
          </button>
          <button className="w-5 h-5 rounded bg-tertiary flex items-center justify-center hover:bg-hover">
            +
          </button>
          <span className="ml-1">$0.01</span>
        </div>
        <div className="flex items-center gap-2 font-medium">
          <span className="text-primary">{base}</span>
          <span className="text-secondary">{quote}</span>
        </div>
      </div>

      <div className="flex items-center justify-between px-4 py-1.5 text-[10px] text-muted font-medium shrink-0">
        <span>Price</span>
        <div className="flex items-center gap-4">
          <span>
            Size <span className="bg-tertiary px-1 py-0.5 rounded ml-0.5">{base}</span>
          </span>
          <span>
            Total <span className="bg-tertiary px-1 py-0.5 rounded ml-0.5">{quote}</span>
          </span>
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden font-mono text-[11px] font-medium">
        <div className="flex flex-col flex-1 justify-end pb-1 overflow-hidden">
          {asks.length === 0 ? (
            <div className="text-center text-muted py-4">Waiting for data...</div>
          ) : (
            asks.map((ask, i) => {
              const sizeVal = parseFloat(ask.size);
              const priceVal = parseFloat(ask.price);
              const totalVal = sizeVal * priceVal;
              return (
                <div
                  key={`ask-${ask.price}-${i}`}
                  className="flex justify-between items-center px-4 py-[3px] hover:bg-hover cursor-pointer relative leading-none shrink-0"
                >
                  <div
                    className="absolute right-0 top-0 bottom-0 bg-danger-bg opacity-[0.15] pointer-events-none"
                    style={{ width: `${(sizeVal / maxSize) * 100}%` }}
                  ></div>
                  <span className="text-danger z-10">{formatCurrency(priceVal)}</span>
                  <div className="flex items-center gap-3 z-10">
                    <span className="text-primary opacity-90">{formatCurrency(sizeVal, true)}</span>
                    <span className="text-secondary w-16 text-right">
                      {formatCurrency(totalVal, true)}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between px-4 py-1.5 border-y border-color bg-primary shrink-0 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-danger font-bold text-[13px]">
              {lowestAsk > 0 ? formatCurrency(lowestAsk) : '-'}
            </span>
          </div>
          <div className="flex flex-col items-end leading-none gap-0.5">
            <span className="text-muted text-[10px]">Spread</span>
            <span className="text-primary text-[11px]">{spreadPercent.toFixed(3)}%</span>
          </div>
        </div>

        <div className="flex flex-col flex-1 pt-1 overflow-hidden">
          {bids.length === 0 ? (
            <div className="text-center text-muted py-4">Waiting for data...</div>
          ) : (
            bids.map((bid, i) => {
              const sizeVal = parseFloat(bid.size);
              const priceVal = parseFloat(bid.price);
              const totalVal = sizeVal * priceVal;
              return (
                <div
                  key={`bid-${bid.price}-${i}`}
                  className="flex justify-between items-center px-4 py-[3px] hover:bg-hover cursor-pointer relative leading-none shrink-0"
                >
                  <div
                    className="absolute right-0 top-0 bottom-0 bg-success-bg opacity-[0.15] pointer-events-none"
                    style={{ width: `${(sizeVal / maxSize) * 100}%` }}
                  ></div>
                  <span className="text-success z-10">{formatCurrency(priceVal)}</span>
                  <div className="flex items-center gap-3 z-10">
                    <span className="text-primary opacity-90">{formatCurrency(sizeVal, true)}</span>
                    <span className="text-secondary w-16 text-right">
                      {formatCurrency(totalVal, true)}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
