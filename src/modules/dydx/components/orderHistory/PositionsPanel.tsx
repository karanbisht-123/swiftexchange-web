import { Edit2, Loader2, TrendingDown, TrendingUp, X } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Notification } from '../../../../components/common/Notification';
import { metadataService } from '../../hooks/useCoinGeckoMetadata';
import { useDydxData } from '../../hooks/useDydxData';
import { useDydxTrading } from '../../hooks/useDydxTrading';
import { type Position } from '../../types/trading.types';
import PriceTriggers, { type TriggerConfig } from '../PriceTriggers';

const PositionsPanel: React.FC = () => {
  const {
    positions: rawPositions,
    loadingPositions,
    positionsError,
    refreshPositions,
    isConnected,
    isReceivingUpdates,
  } = useDydxData();

  const positions = rawPositions as Position[];
  const { closePosition, setTriggers, isSettingTriggers, orderError, clearOrderError } =
    useDydxTrading();

  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null);
  const [showPriceTriggers, setShowPriceTriggers] = useState(false);
  const [closingMarket, setClosingMarket] = useState<string | null>(null);
  const [icons, setIcons] = useState<Record<string, string>>({});
  const [newPositionsCount, setNewPositionsCount] = useState(0);

  const prevPositionsLengthRef = useRef(positions.length);
  const newPositionTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [notification, setNotification] = useState<{
    message: string;
    type: 'success' | 'error';
  } | null>(null);

  const showNotification = (message: string, type: 'success' | 'error') => {
    setNotification({ message, type });
  };

  const activeMarkets = useMemo(() => [...new Set(positions.map(p => p.market))], [positions]);

  useEffect(() => {
    const currentLength = positions.length;
    const prevLength = prevPositionsLengthRef.current;

    if (currentLength > prevLength && prevLength > 0) {
      const newCount = currentLength - prevLength;
      setNewPositionsCount(newCount);

      if (newPositionTimerRef.current) {
        clearTimeout(newPositionTimerRef.current);
      }

      newPositionTimerRef.current = setTimeout(() => {
        setNewPositionsCount(0);
      }, 5000);
    }

    prevPositionsLengthRef.current = currentLength;

    return () => {
      if (newPositionTimerRef.current) {
        clearTimeout(newPositionTimerRef.current);
      }
    };
  }, [positions.length]);

  useEffect(() => {
    if (activeMarkets.length === 0) return;

    const fetchIcons = async () => {
      const results = await Promise.allSettled(
        activeMarkets.map(async market => {
          const metadata = await metadataService.getMetadata(market);
          return { market, icon: metadata?.image };
        })
      );

      const newIcons: Record<string, string> = {};
      results.forEach(result => {
        if (result.status === 'fulfilled' && result.value.icon) {
          newIcons[result.value.market] = result.value.icon;
        }
      });

      setIcons(prev => ({ ...prev, ...newIcons }));
    };

    fetchIcons();
  }, [activeMarkets]);

  const handleEdit = useCallback(
    (position: Position) => {
      clearOrderError();
      setSelectedPosition(position);
      setShowPriceTriggers(true);
    },
    [clearOrderError]
  );

  const handleSaveTriggers = useCallback(
    async (config: TriggerConfig) => {
      if (!selectedPosition) return;

      try {
        const params: any = {};
        if (config.takeProfit?.enabled) params.takeProfit = config.takeProfit;
        if (config.stopLoss?.enabled) params.stopLoss = config.stopLoss;

        const result = await setTriggers(selectedPosition, params);

        let successCount = 0;
        if (result.takeProfit?.success) successCount++;
        if (result.stopLoss?.success) successCount++;

        if (successCount > 0) {
          const triggerText = successCount === 2 ? 'Take Profit & Stop Loss' : 'Trigger';
          showNotification(`${triggerText} set successfully!`, 'success');
          setShowPriceTriggers(false);
          setTimeout(refreshPositions, 1500);
        } else {
          const errorMsg =
            result.takeProfit?.error || result.stopLoss?.error || 'Failed to set triggers';
          showNotification(errorMsg, 'error');
        }
      } catch (error: any) {
        showNotification(error.message || 'Failed to set triggers', 'error');
      }
    },
    [selectedPosition, setTriggers, refreshPositions]
  );

  const handleClose = useCallback(
    async (position: Position) => {
      if (!window.confirm(`Close ${position.market} position?`)) return;

      setClosingMarket(position.market);

      try {
        const result = await closePosition(position);

        if (result.success) {
          showNotification(`Position ${position.market} closed successfully!`, 'success');
          setTimeout(refreshPositions, 2000);
        } else {
          showNotification(result.userMessage || 'Failed to close position', 'error');
        }
      } catch (error: any) {
        showNotification(error.message || 'Failed to close position', 'error');
      } finally {
        setClosingMarket(null);
      }
    },
    [closePosition, refreshPositions]
  );

  const formatPrice = useCallback((value: string | number) => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }, []);

  const getMarketIcon = useCallback(
    (market: string) => {
      const icon = icons[market];
      if (icon) {
        return (
          <img
            src={icon}
            alt={market}
            className="w-full h-full object-cover"
            onError={e => {
              e.currentTarget.style.display = 'none';
              e.currentTarget.parentElement!.innerHTML = `<span class="text-[8px]">${market.substring(0, 1)}</span>`;
            }}
          />
        );
      }
      return <span className="text-[8px]">{market.substring(0, 1)}</span>;
    },
    [icons]
  );

  if (!isConnected) {
    return (
      <div className="flex items-center justify-center h-full text-muted">
        <div className="text-center">
          <h3 className="text-lg font-semibold text-primary mb-2">Connect Wallet</h3>
          <p className="text-sm">Connect your wallet to view positions</p>
        </div>
      </div>
    );
  }

  if (loadingPositions && positions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted">
        <Loader2 className="w-6 h-6 animate-spin mb-2" />
        <p>Loading positions...</p>
      </div>
    );
  }

  if (positionsError) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <div className="p-6 bg-red-500/10 border border-red-500/20 rounded-lg text-center max-w-md">
          <h3 className="text-lg font-semibold text-red-400 mb-2">Error Loading Positions</h3>
          <p className="text-sm text-muted mb-4">{positionsError}</p>
          <button
            onClick={refreshPositions}
            className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (positions.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-muted">
        <div className="text-center">
          <h3 className="text-lg font-semibold text-primary mb-2">No Open Positions</h3>
          <p className="text-sm">Your active positions will appear here</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-primary overflow-auto relative">
      {notification && (
        <Notification
          type={notification.type}
          message={notification.message}
          onClose={() => setNotification(null)}
          autoClose={true}
          autoCloseDuration={4000}
        />
      )}

      {newPositionsCount > 0 && (
        <div className="absolute top-2 right-2 z-20 bg-green-500 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg animate-pulse">
          +{newPositionsCount} New Position{newPositionsCount > 1 ? 's' : ''}
        </div>
      )}

      {/* Desktop Table */}
      <div className="hidden md:block">
        <table className="w-full text-left text-[11px] border-collapse">
          <thead className="bg-secondary text-muted font-medium uppercase sticky top-0 z-10">
            <tr>
              <th className="p-3 border-b border-color">
                <div className="flex items-center gap-2">
                  Market
                  {!isReceivingUpdates && (
                    <div
                      className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse"
                      title="Reconnecting..."
                    />
                  )}
                </div>
              </th>
              <th className="p-3 border-b border-color">Side</th>
              <th className="p-3 border-b border-color text-right">Size</th>
              <th className="p-3 border-b border-color text-right">Avg. Open</th>
              <th className="p-3 border-b border-color text-right">Oracle</th>
              <th className="p-3 border-b border-color text-right">Liq. Price</th>
              <th className="p-3 border-b border-color text-right">Unrealized P&L</th>
              <th className="p-3 border-b border-color text-right">Funding</th>
              <th className="p-3 border-b border-color text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {positions.map(position => {
              const rawSize = parseFloat(position.size);
              const absSize = Math.abs(rawSize);
              if (absSize === 0) return null;

              const entryPrice = parseFloat(position.entryPrice);
              const oraclePrice = position.market || entryPrice;
              const unrealizedPnl = parseFloat(position.unrealizedPnl);
              const pnlPercentage = (unrealizedPnl / (absSize * entryPrice)) * 100;
              const isShort = position.side === 'SHORT';
              const isClosing = closingMarket === position.market;

              return (
                <tr
                  key={position.market}
                  className="border-b border-color hover:bg-hover transition-colors"
                >
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full bg-secondary flex items-center justify-center overflow-hidden">
                        {getMarketIcon(position.market)}
                      </div>
                      <span className="font-bold text-primary">{position.market}</span>
                    </div>
                  </td>

                  <td className="p-3">
                    <div
                      className={`flex items-center justify-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${isShort ? 'text-red-400 bg-red-400/10' : 'text-green-400 bg-green-400/10'
                        }`}
                    >
                      {isShort ? <TrendingDown size={10} /> : <TrendingUp size={10} />}
                      {position.side}
                    </div>
                  </td>

                  <td className="p-3 text-right text-primary font-mono">{absSize.toFixed(4)}</td>

                  <td className="p-3 text-right text-muted font-mono">
                    ${formatPrice(entryPrice)}
                  </td>

                  <td className="p-3 text-right text-blue-400 font-mono">
                    ${formatPrice(oraclePrice)}
                  </td>

                  <td className="p-3 text-right text-orange-400 font-mono">
                    ${position.liquidationPrice ? formatPrice(position.liquidationPrice) : '—'}
                  </td>

                  <td className="p-3 text-right">
                    <div
                      className={`flex flex-col font-mono ${unrealizedPnl >= 0 ? 'text-green-400' : 'text-red-400'
                        }`}
                    >
                      <span>
                        {unrealizedPnl >= 0 ? '+' : ''}${formatPrice(unrealizedPnl)}
                      </span>
                      <span className="text-[9px] opacity-80">({pnlPercentage.toFixed(2)}%)</span>
                    </div>
                  </td>

                  <td className="p-3 text-right text-muted font-mono">
                    {parseFloat(position.netFunding || '0').toFixed(4)}
                  </td>

                  <td className="p-3 text-center">
                    <div className="flex justify-center gap-2">
                      <button
                        onClick={() => handleEdit(position)}
                        disabled={isClosing}
                        className="p-1.5 bg-secondary hover:bg-hover rounded text-muted hover:text-primary transition-all disabled:opacity-50"
                        title="Set TP/SL"
                      >
                        <Edit2 size={12} />
                      </button>
                      <button
                        onClick={() => handleClose(position)}
                        disabled={isClosing}
                        className="p-1.5 bg-secondary hover:bg-red-900/40 rounded text-muted hover:text-red-400 transition-all disabled:opacity-50"
                        title="Close Position"
                      >
                        {isClosing ? (
                          <Loader2 size={12} className="animate-spin" />
                        ) : (
                          <X size={12} />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-1.5 p-2">
        {positions.map(position => {
          const rawSize = parseFloat(position.size);
          const absSize = Math.abs(rawSize);
          if (absSize === 0) return null;

          const entryPrice = parseFloat(position.entryPrice);
          const oraclePrice = position.market || entryPrice;
          const unrealizedPnl = parseFloat(position.unrealizedPnl);
          const pnlPercentage = (unrealizedPnl / (absSize * entryPrice)) * 100;
          const isShort = position.side === 'SHORT';
          const isClosing = closingMarket === position.market;

          return (
            <div key={position.market} className="bg-secondary border border-color rounded-lg p-2.5 text-xs">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center overflow-hidden">
                    {getMarketIcon(position.market)}
                  </div>
                  <span className="font-bold text-primary">{position.market}</span>
                </div>

                <div className="flex items-center gap-2">
                  <div
                    className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold ${isShort ? 'text-red-400 bg-red-400/10' : 'text-green-400 bg-green-400/10'
                      }`}
                  >
                    {isShort ? <TrendingDown size={10} /> : <TrendingUp size={10} />}
                    {position.side}
                  </div>

                  <button
                    onClick={() => handleEdit(position)}
                    disabled={isClosing}
                    className="p-1.5 bg-primary hover:bg-hover rounded text-muted hover:text-primary transition-all disabled:opacity-50"
                    title="Set TP/SL"
                  >
                    <Edit2 size={12} />
                  </button>
                  <button
                    onClick={() => handleClose(position)}
                    disabled={isClosing}
                    className="p-1.5 bg-primary hover:bg-red-900/40 rounded text-muted hover:text-red-400 transition-all disabled:opacity-50"
                    title="Close Position"
                  >
                    {isClosing ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
                  </button>
                </div>
              </div>


              <div className="border-t border-dashed border-color pt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
                <div className="flex flex-col gap-0.5">
                  <span className="text-muted text-[9px] uppercase tracking-wide font-medium">Size</span>
                  <span className="text-primary font-medium font-mono">{absSize.toFixed(4)}</span>
                </div>

                <div className="flex flex-col gap-0.5">
                  <span className="text-muted text-[9px] uppercase tracking-wide font-medium">Avg Open</span>
                  <span className="text-primary font-medium font-mono">${formatPrice(entryPrice)}</span>
                </div>

                <div className="flex flex-col gap-0.5">
                  <span className="text-muted text-[9px] uppercase tracking-wide font-medium">Oracle</span>
                  <span className="text-blue-400 font-medium font-mono">${formatPrice(oraclePrice)}</span>
                </div>

                <div className="flex flex-col gap-0.5">
                  <span className="text-muted text-[9px] uppercase tracking-wide font-medium">Liq Price</span>
                  <span className="text-orange-400 font-medium font-mono">
                    ${position.liquidationPrice ? formatPrice(position.liquidationPrice) : '—'}
                  </span>
                </div>

                <div className="flex flex-col gap-0.5">
                  <span className="text-muted text-[9px] uppercase tracking-wide font-medium">Unrealized P&L</span>
                  <div className={`font-medium font-mono ${unrealizedPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    <div>{unrealizedPnl >= 0 ? '+' : ''}${formatPrice(unrealizedPnl)}</div>
                    <div className="text-[9px] opacity-80">({pnlPercentage.toFixed(2)}%)</div>
                  </div>
                </div>

                <div className="flex flex-col gap-0.5">
                  <span className="text-muted text-[9px] uppercase tracking-wide font-medium">Funding</span>
                  <span className="text-primary font-medium font-mono">
                    {parseFloat(position.netFunding || '0').toFixed(4)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {selectedPosition && (
        <PriceTriggers
          isOpen={showPriceTriggers}
          onClose={() => setShowPriceTriggers(false)}
          position={selectedPosition}
          isLoading={isSettingTriggers}
          error={orderError}
          onSave={handleSaveTriggers}
        />
      )}
    </div>
  );
};

export default PositionsPanel;