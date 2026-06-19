import React, { useEffect, useMemo, useRef, useState } from 'react';

import { useOrderbook } from '../hooks/useOrderbook';
import useMarketStore from '../store/marketStore';

interface DepthPoint {
  price: number;
  total: number;
  isBid?: boolean;
}

const DepthChart: React.FC = () => {
  const { selectedMarket } = useMarketStore();
  const { orderbook } = useOrderbook(selectedMarket);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationFrameRef = useRef<number | null>(null);

  const [hoveredPoint, setHoveredPoint] = useState<DepthPoint | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  const depthData = useMemo(() => {
    if (!orderbook?.bids?.length || !orderbook?.asks?.length) return null;

    const bids: DepthPoint[] = [];
    const asks: DepthPoint[] = [];
    let bidTotal = 0;
    let askTotal = 0;

    orderbook.bids.slice(0, 50).forEach(b => {
      const price = parseFloat(b.price);
      const size = parseFloat(b.size);
      if (!isNaN(price) && !isNaN(size) && size > 0) {
        bidTotal += size;
        bids.push({ price, total: bidTotal, isBid: true });
      }
    });

    orderbook.asks.slice(0, 50).forEach(a => {
      const price = parseFloat(a.price);
      const size = parseFloat(a.size);
      if (!isNaN(price) && !isNaN(size) && size > 0) {
        askTotal += size;
        asks.push({ price, total: askTotal, isBid: false });
      }
    });

    if (bids.length === 0 || asks.length === 0) return null;

    const bestBid = bids[0]?.price || 0;
    const bestAsk = asks[0]?.price || 0;
    const midPrice = (bestBid + bestAsk) / 2;
    const spread = bestAsk - bestBid;

    return { bids, asks, bestBid, bestAsk, midPrice, spread };
  }, [orderbook]);

  useEffect(() => {
    const resizeObserver = new ResizeObserver(() => {
      if (containerRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect();
        setCanvasSize({ width, height });
      }
    });
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    if (!canvasRef.current || !depthData || canvasSize.width === 0) return;

    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;

      canvas.width = canvasSize.width * dpr;
      canvas.height = canvasSize.height * dpr;
      canvas.style.width = `${canvasSize.width}px`;
      canvas.style.height = `${canvasSize.height}px`;
      ctx.scale(dpr, dpr);

      const { bids, asks, midPrice } = depthData;
      const padding = { top: 20, right: 40, bottom: 22, left: 40 };
      const chartWidth = canvasSize.width - padding.left - padding.right;
      const chartHeight = canvasSize.height - padding.top - padding.bottom;
      const centerX = padding.left + chartWidth / 2;

      ctx.fillStyle =
        getComputedStyle(document.documentElement)
          .getPropertyValue('--color-bg-secondary')
          .trim() || '#191c25';
      ctx.fillRect(0, 0, canvasSize.width, canvasSize.height);

      const maxTotal = Math.max(
        bids[bids.length - 1]?.total || 0,
        asks[asks.length - 1]?.total || 0
      );

      const maxBidSpread = midPrice - (bids[bids.length - 1]?.price || midPrice);
      const maxAskSpread = (asks[asks.length - 1]?.price || midPrice) - midPrice;
      const maxSpread = Math.max(maxBidSpread, maxAskSpread);

      const xScaleBid = (price: number) => {
        const percentFromCenter = (midPrice - price) / maxSpread;
        return centerX - (percentFromCenter * chartWidth) / 2;
      };

      const xScaleAsk = (price: number) => {
        const percentFromCenter = (price - midPrice) / maxSpread;
        return centerX + (percentFromCenter * chartWidth) / 2;
      };

      const yScale = (total: number) =>
        padding.top + chartHeight - (total / maxTotal) * chartHeight;

      const borderColor =
        getComputedStyle(document.documentElement).getPropertyValue('--color-border').trim() ||
        '#2d3241';
      const textMuted =
        getComputedStyle(document.documentElement).getPropertyValue('--color-text-muted').trim() ||
        '#8b95a5';

      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 1;

      for (let i = 0; i <= 4; i++) {
        const y = padding.top + (chartHeight / 4) * i;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(canvasSize.width - padding.right, y);
        ctx.stroke();

        const total = maxTotal * (1 - i / 4);
        ctx.fillStyle = textMuted;
        ctx.font = '10px monospace';
        ctx.textAlign = 'right';
        ctx.fillText(total.toFixed(1), padding.left - 5, y + 3);
      }

      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(centerX, padding.top);
      ctx.lineTo(centerX, canvasSize.height - padding.bottom);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = textMuted;
      ctx.font = '11px monospace';
      ctx.textAlign = 'center';

      const numTicks = canvasSize.width < 500 ? 1 : 3;
      const formatPrice = (price: number) => {
        if (price >= 1000) return price.toLocaleString(undefined, { maximumFractionDigits: 1 });
        if (price >= 1) return price.toLocaleString(undefined, { maximumFractionDigits: 2 });
        return price.toLocaleString(undefined, { maximumFractionDigits: 4 });
      };

      for (let i = 1; i <= numTicks; i++) {
        const bidPrice = midPrice - (maxSpread * i) / numTicks;
        const askPrice = midPrice + (maxSpread * i) / numTicks;

        ctx.fillText(formatPrice(bidPrice), xScaleBid(bidPrice), canvasSize.height - 4);
        ctx.fillText(formatPrice(askPrice), xScaleAsk(askPrice), canvasSize.height - 4);
      }
      ctx.fillText(formatPrice(midPrice), centerX, canvasSize.height - 4);

      ctx.beginPath();
      ctx.moveTo(centerX, yScale(0));
      let prevY = yScale(0);
      bids.forEach(b => {
        const x = xScaleBid(b.price);
        const y = yScale(b.total);
        ctx.lineTo(x, prevY);
        ctx.lineTo(x, y);
        prevY = y;
      });
      ctx.lineTo(xScaleBid(bids[bids.length - 1].price), yScale(0));
      ctx.closePath();

      const bidGradient = ctx.createLinearGradient(
        0,
        padding.top,
        0,
        canvasSize.height - padding.bottom
      );
      bidGradient.addColorStop(0, 'rgba(16, 185, 129, 0.3)');
      bidGradient.addColorStop(1, 'rgba(16, 185, 129, 0.02)');
      ctx.fillStyle = bidGradient;
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(centerX, yScale(0));
      let linePrevY = yScale(0);
      bids.forEach(b => {
        const x = xScaleBid(b.price);
        const y = yScale(b.total);
        ctx.lineTo(x, linePrevY);
        ctx.lineTo(x, y);
        linePrevY = y;
      });
      ctx.strokeStyle =
        getComputedStyle(document.documentElement).getPropertyValue('--color-success').trim() ||
        '#10b981';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(centerX, yScale(0));
      let askPrevY = yScale(0);
      asks.forEach(a => {
        const x = xScaleAsk(a.price);
        const y = yScale(a.total);
        ctx.lineTo(x, askPrevY);
        ctx.lineTo(x, y);
        askPrevY = y;
      });
      ctx.lineTo(xScaleAsk(asks[asks.length - 1].price), yScale(0));
      ctx.closePath();

      const askGradient = ctx.createLinearGradient(
        0,
        padding.top,
        0,
        canvasSize.height - padding.bottom
      );
      askGradient.addColorStop(0, 'rgba(239, 68, 68, 0.3)');
      askGradient.addColorStop(1, 'rgba(239, 68, 68, 0.02)');
      ctx.fillStyle = askGradient;
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(centerX, yScale(0));
      let askLinePrevY = yScale(0);
      asks.forEach(a => {
        const x = xScaleAsk(a.price);
        const y = yScale(a.total);
        ctx.lineTo(x, askLinePrevY);
        ctx.lineTo(x, y);
        askLinePrevY = y;
      });
      ctx.strokeStyle =
        getComputedStyle(document.documentElement).getPropertyValue('--color-danger').trim() ||
        '#ef4444';
      ctx.lineWidth = 2;
      ctx.stroke();

      if (hoveredPoint) {
        const x = hoveredPoint.isBid
          ? xScaleBid(hoveredPoint.price)
          : xScaleAsk(hoveredPoint.price);
        const y = yScale(hoveredPoint.total);

        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fillStyle = hoveredPoint.isBid ? '#10b981' : '#ef4444';
        ctx.fill();
        ctx.strokeStyle = ctx.fillStyle =
          getComputedStyle(document.documentElement)
            .getPropertyValue('--color-bg-secondary')
            .trim() || '#191c25';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    };

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    animationFrameRef.current = requestAnimationFrame(draw);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [depthData, canvasSize, hoveredPoint]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !depthData) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const padding = { top: 20, right: 40, bottom: 40, left: 40 };
    const centerX = canvasSize.width / 2;

    if (
      x < padding.left ||
      x > canvasSize.width - padding.right ||
      y < padding.top ||
      y > canvasSize.height - padding.bottom
    ) {
      setHoveredPoint(null);
      return;
    }

    const { bids, asks, midPrice } = depthData;

    const isLeftSide = x < centerX;

    let closest: DepthPoint | null = null;
    let minDist = Infinity;

    const dataToCheck = isLeftSide ? bids : asks;

    dataToCheck.forEach(point => {
      const dist = Math.abs(point.price - midPrice);
      if (dist < minDist) {
        minDist = dist;
        closest = point;
      }
    });

    setHoveredPoint(closest);
  };

  const base = selectedMarket.split('-')[0] || 'BTC';

  return (
    <div className="w-full h-full bg-secondary text-primary flex flex-col">
      <div ref={containerRef} className="relative flex-1">
        {!depthData ? (
          <div className="flex items-center justify-center h-full">
            <span className="text-muted text-sm">Loading depth data...</span>
          </div>
        ) : (
          <>
            <canvas
              ref={canvasRef}
              onMouseMove={handleMouseMove}
              onMouseLeave={() => setHoveredPoint(null)}
              style={{ cursor: 'crosshair', display: 'block' }}
              className="w-full min-h-[300px]"
            />

            {hoveredPoint && (
              <div
                className="absolute bg-secondary border border-color rounded px-3 py-2 text-xs pointer-events-none shadow-lg"
                style={{
                  left: '50%',
                  top: '10px',
                  transform: 'translateX(-50%)',
                  zIndex: 10,
                }}
              >
                <div className="flex gap-4">
                  <div>
                    <span className="text-muted">Price: </span>
                    <span className={hoveredPoint.isBid ? 'price-up' : 'price-down'}>
                      {hoveredPoint.price.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted">Total: </span>
                    <span className="text-primary">
                      {hoveredPoint.total.toFixed(4)} {base}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {depthData && (
        <div className="flex items-center justify-center gap-6 px-4 py-3 border-t border-color text-xs shrink-0">
          <div className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-sm"
              style={{ backgroundColor: 'var(--color-success)' }}
            ></div>
            <span className="text-muted">Bids</span>
          </div>
          <div className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-sm"
              style={{ backgroundColor: 'var(--color-danger)' }}
            ></div>
            <span className="text-muted">Asks</span>
          </div>
          <div className="text-muted">
            Spread: <span className="text-primary">{depthData.spread.toFixed(2)}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default DepthChart;