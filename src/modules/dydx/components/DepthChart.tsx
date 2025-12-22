import React, { useEffect, useMemo, useRef, useState } from 'react';

import { useOrderbook } from '../hooks/useOrderbook';
import useMarketStore from '../store/marketStore';

interface DepthPoint {
  price: number;
  total: number;
  isBid?: boolean;
}

const DepthChart: React.FC<{ height?: number }> = ({ height = 400 }) => {
  const { selectedMarket } = useMarketStore();
  const { orderbook } = useOrderbook(selectedMarket);
  // console.log(isConnected, dataSource, '-----');

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
        bids.push({ price, total: bidTotal });
      }
    });

    orderbook.asks.slice(0, 50).forEach(a => {
      const price = parseFloat(a.price);
      const size = parseFloat(a.size);
      if (!isNaN(price) && !isNaN(size) && size > 0) {
        askTotal += size;
        asks.push({ price, total: askTotal });
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
    const updateSize = () => {
      if (containerRef.current) {
        const { width } = containerRef.current.getBoundingClientRect();
        setCanvasSize({ width, height });
      }
    };

    updateSize();
    const resizeObserver = new ResizeObserver(updateSize);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => resizeObserver.disconnect();
  }, [height]);

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
      const padding = { top: 20, right: 60, bottom: 40, left: 60 };
      const chartWidth = canvasSize.width - padding.left - padding.right;
      const chartHeight = canvasSize.height - padding.top - padding.bottom;

      // Clear canvas
      ctx.fillStyle = '#0e0c15';
      ctx.fillRect(0, 0, canvasSize.width, canvasSize.height);

      // Calculate scales
      const minPrice = Math.min(bids[bids.length - 1]?.price || 0);
      const maxPrice = Math.max(asks[asks.length - 1]?.price || 0);
      const maxTotal = Math.max(
        bids[bids.length - 1]?.total || 0,
        asks[asks.length - 1]?.total || 0
      );

      const priceRange = maxPrice - minPrice;
      const xScale = (price: number) =>
        padding.left + ((price - minPrice) / priceRange) * chartWidth;
      const yScale = (total: number) =>
        padding.top + chartHeight - (total / maxTotal) * chartHeight;

      // Draw grid
      ctx.strokeStyle = '#232027';
      ctx.lineWidth = 1;

      // Horizontal grid lines
      for (let i = 0; i <= 5; i++) {
        const y = padding.top + (chartHeight / 5) * i;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(canvasSize.width - padding.right, y);
        ctx.stroke();

        // Y-axis labels
        const total = maxTotal * (1 - i / 5);
        ctx.fillStyle = '#6b6b76';
        ctx.font = '11px monospace';
        ctx.textAlign = 'right';
        ctx.fillText(total.toFixed(2), padding.left - 10, y + 4);
      }

      for (let i = 0; i <= 5; i++) {
        const x = padding.left + (chartWidth / 5) * i;
        ctx.beginPath();
        ctx.moveTo(x, padding.top);
        ctx.lineTo(x, canvasSize.height - padding.bottom);
        ctx.stroke();

        const price = minPrice + (priceRange / 5) * i;
        ctx.fillStyle = '#6b6b76';
        ctx.font = '11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(price.toFixed(0), x, canvasSize.height - padding.bottom + 20);
      }

      const midX = xScale(midPrice);
      ctx.strokeStyle = '#666';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(midX, padding.top);
      ctx.lineTo(midX, canvasSize.height - padding.bottom);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.beginPath();
      ctx.moveTo(xScale(bids[0].price), yScale(0));
      bids.forEach(b => {
        ctx.lineTo(xScale(b.price), yScale(b.total));
      });
      ctx.lineTo(xScale(bids[bids.length - 1].price), yScale(0));
      ctx.closePath();

      const bidGradient = ctx.createLinearGradient(
        0,
        padding.top,
        0,
        canvasSize.height - padding.bottom
      );
      bidGradient.addColorStop(0, 'rgba(0, 255, 157, 0.3)');
      bidGradient.addColorStop(1, 'rgba(0, 255, 157, 0.02)');
      ctx.fillStyle = bidGradient;
      ctx.fill();

      // Draw bids line
      ctx.beginPath();
      bids.forEach((b, i) => {
        const x = xScale(b.price);
        const y = yScale(b.total);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = '#00ff9d';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(xScale(asks[0].price), yScale(0));
      asks.forEach(a => {
        ctx.lineTo(xScale(a.price), yScale(a.total));
      });
      ctx.lineTo(xScale(asks[asks.length - 1].price), yScale(0));
      ctx.closePath();

      const askGradient = ctx.createLinearGradient(
        0,
        padding.top,
        0,
        canvasSize.height - padding.bottom
      );
      askGradient.addColorStop(0, 'rgba(255, 59, 105, 0.3)');
      askGradient.addColorStop(1, 'rgba(255, 59, 105, 0.02)');
      ctx.fillStyle = askGradient;
      ctx.fill();

      ctx.beginPath();
      asks.forEach((a, i) => {
        const x = xScale(a.price);
        const y = yScale(a.total);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = '#ff3b69';
      ctx.lineWidth = 2;
      ctx.stroke();

      if (hoveredPoint) {
        const x = xScale(hoveredPoint.price);
        const y = yScale(hoveredPoint.total);

        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fillStyle = hoveredPoint.isBid ? '#00ff9d' : '#ff3b69';
        ctx.fill();
        ctx.strokeStyle = '#0e0c15';
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

  // Handle mouse move
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !depthData) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const padding = { top: 20, right: 60, bottom: 40, left: 60 };
    const chartWidth = canvasSize.width - padding.left - padding.right;

    if (
      x < padding.left ||
      x > canvasSize.width - padding.right ||
      y < padding.top ||
      y > canvasSize.height - padding.bottom
    ) {
      setHoveredPoint(null);
      return;
    }

    const { bids, asks } = depthData;
    const minPrice = Math.min(bids[bids.length - 1]?.price || 0);
    const maxPrice = Math.max(asks[asks.length - 1]?.price || 0);
    const priceRange = maxPrice - minPrice;

    const price = minPrice + ((x - padding.left) / chartWidth) * priceRange;

    // Find closest point
    let closestBid: DepthPoint | null = null;
    let closestAsk: DepthPoint | null = null;
    let minBidDist = Infinity;
    let minAskDist = Infinity;

    bids.forEach(b => {
      const dist = Math.abs(b.price - price);
      if (dist < minBidDist) {
        minBidDist = dist;
        closestBid = { ...b, isBid: true };
      }
    });

    asks.forEach(a => {
      const dist = Math.abs(a.price - price);
      if (dist < minAskDist) {
        minAskDist = dist;
        closestAsk = { ...a, isBid: false };
      }
    });

    const closest = minBidDist < minAskDist ? closestBid : closestAsk;
    setHoveredPoint(closest);
  };

  const base = selectedMarket.split('-')[0] || 'BTC';
  // const quote = selectedMarket.split('-')[1] || 'USD';
  // console.log(quote, '---quote---');

  return (
    <div className="w-full bg-primary text-white">
      {/* <div className="flex items-center justify-between px-4 py-3 border-b border-[#232027]">
        <div className="flex items-center gap-3">
          <span className="text-[#aaaaaa] text-xs font-semibold">Depth Chart</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-white font-semibold text-sm">{base}</span>
          <span className="text-[#aaaaaa]">/</span>
          <span className="text-[#aaaaaa] text-sm">{quote}</span>
          <div
            className={`w-2 h-2 rounded-full ${
              isConnected && dataSource === 'websocket' ? 'bg-[#00ff9d]' : 'bg-[#ffaa00]'
            } ${isConnected ? 'animate-pulse' : ''}`}
          />
        </div>
      </div> */}

      <div ref={containerRef} className="relative">
        {!depthData ? (
          <div className="flex items-center justify-center" style={{ height }}>
            <span className="text-[#6b6b76] text-sm">Loading depth data...</span>
          </div>
        ) : (
          <>
            <canvas
              ref={canvasRef}
              onMouseMove={handleMouseMove}
              onMouseLeave={() => setHoveredPoint(null)}
              style={{ cursor: 'crosshair', display: 'block' }}
            />

            {hoveredPoint && (
              <div
                className="absolute bg-primary border border-gray-600 rounded px-3 py-2 text-xs pointer-events-none shadow-lg"
                style={{
                  left: '50%',
                  top: '10px',
                  transform: 'translateX(-50%)',
                  zIndex: 10,
                }}
              >
                <div className="flex gap-4">
                  <div>
                    <span className="text-[#6b6b76]">Price: </span>
                    <span className={hoveredPoint.isBid ? 'text-[#00ff9d]' : 'text-[#ff3b69]'}>
                      {hoveredPoint.price.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#6b6b76]">Total: </span>
                    <span className="text-white">
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
        <div className="flex items-center justify-center gap-6 px-4 py-3 border-t border-[#232027] text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-[#00ff9d] rounded-sm"></div>
            <span className="text-[#6b6b76]">Bids</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-[#ff3b69] rounded-sm"></div>
            <span className="text-[#6b6b76]">Asks</span>
          </div>
          <div className="text-[#6b6b76]">
            Spread: <span className="text-white">{depthData.spread.toFixed(2)}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default DepthChart;
