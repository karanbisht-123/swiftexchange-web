import { Edit2, Loader2, X } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { dydxTradingService } from '../../service/dydxTradingService';
import { dydxWalletService } from '../../service/dydxWalletService';
import { type Position, localStateManager } from '../../utils/localStateManager';
import PriceTriggers, { type TriggerConfig } from '../PriceTriggers';

const PositionsPanel: React.FC = () => {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null);
  const [showPriceTriggers, setShowPriceTriggers] = useState(false);
  const [oraclePrices, setOraclePrices] = useState<Record<string, number>>({});
  const [closingPosition, setClosingPosition] = useState<string | null>(null);

  const address = dydxWalletService.getAddress();
  const subNo = dydxWalletService.getSubaccountNumber();
  const isConnected = !!address;

  useEffect(() => {
    if (!isConnected) {
      setLoading(false);
      setPositions([]);
      return;
    }

    const init = async () => {
      try {
        setLoading(true);
        await localStateManager.initialize(address!, subNo);
      } catch (error) {
        console.error('[PositionsPanel] Initialization error:', error);
      } finally {
        setLoading(false);
      }
    };

    init();

    const unsubscribe = localStateManager.subscribe(data => {
      setPositions(data.positions);
      setLoading(localStateManager.getIsLoading());
    });

    return () => {
      unsubscribe();
    };
  }, [address, subNo, isConnected]);

  const marketTickers = useMemo(() => {
    return [...new Set(positions.map(p => p.market))];
  }, [positions]);

  useEffect(() => {
    if (marketTickers.length === 0) return;

    const indexer = dydxWalletService.getIndexerClient();
    if (!indexer) return;

    let isActive = true;

    const fetchOraclePrices = async () => {
      if (!isActive) return;

      const pricePromises = marketTickers.map(async ticker => {
        try {
          const book = await indexer.markets.getPerpetualMarketOrderbook(ticker);
          if (book.bids?.length && book.asks?.length) {
            const midPrice = (parseFloat(book.bids[0].price) + parseFloat(book.asks[0].price)) / 2;
            return { ticker, price: midPrice };
          }
        } catch (error) {
          console.error(`Failed to fetch price for ${ticker}:`, error);
        }
        return null;
      });

      const results = await Promise.all(pricePromises);

      if (!isActive) return;

      const newPrices: Record<string, number> = {};
      results.forEach(result => {
        if (result) {
          newPrices[result.ticker] = result.price;
        }
      });

      setOraclePrices(prev => ({ ...prev, ...newPrices }));
    };

    fetchOraclePrices();
    const interval = setInterval(fetchOraclePrices, 5000);

    return () => {
      isActive = false;
      clearInterval(interval);
    };
  }, [marketTickers]);

  const handleEditPosition = useCallback((position: Position) => {
    setSelectedPosition(position);
    setShowPriceTriggers(true);
  }, []);

  const handleSaveTriggers = useCallback(
    async (config: TriggerConfig) => {
      if (!selectedPosition) return;

      try {
        const marketInfo = await dydxTradingService.getMarketInfo(selectedPosition.market);

        const promises: Promise<any>[] = [];

        if (config.takeProfit?.enabled && config.takeProfit.price) {
          const tpType =
            config.takeProfit.type === 'MARKET' ? 'TAKE_PROFIT_MARKET' : 'TAKE_PROFIT_LIMIT';
          const side = selectedPosition.side === 'LONG' ? 'SELL' : 'BUY';

          promises.push(
            dydxTradingService.placeOrder(
              {
                market: selectedPosition.market,
                side: side as any,
                type: tpType,
                size: parseFloat(selectedPosition.size),
                triggerPrice: config.takeProfit.price,
                price: config.takeProfit.type === 'LIMIT' ? config.takeProfit.price : undefined,
                reduceOnly: true,
              },
              marketInfo
            )
          );
        }

        if (config.stopLoss?.enabled && config.stopLoss.price) {
          const slType = config.stopLoss.type === 'MARKET' ? 'STOP_MARKET' : 'STOP_LIMIT';
          const side = selectedPosition.side === 'LONG' ? 'SELL' : 'BUY';

          promises.push(
            dydxTradingService.placeOrder(
              {
                market: selectedPosition.market,
                side: side as any,
                type: slType,
                size: parseFloat(selectedPosition.size),
                triggerPrice: config.stopLoss.price,
                price: config.stopLoss.type === 'LIMIT' ? config.stopLoss.price : undefined,
                reduceOnly: true,
              },
              marketInfo
            )
          );
        }

        const results = await Promise.all(promises);
        const allSuccess = results.every(r => r.success);

        if (allSuccess) {
          alert('Triggers set successfully!');
          setShowPriceTriggers(false);
        } else {
          const errors = results.filter(r => !r.success).map(r => r.userMessage);
          alert('Some triggers failed: ' + errors.join(', '));
        }
      } catch (error: any) {
        console.error('Failed to set triggers:', error);
        alert('Failed to set triggers: ' + (error.message || 'Unknown error'));
      }
    },
    [selectedPosition]
  );

  const handleClosePosition = useCallback(async (position: Position) => {
    if (!confirm(`Close ${position.side} position for ${position.market}?`)) return;

    setClosingPosition(position.market);
    try {
      const marketInfo = await dydxTradingService.getMarketInfo(position.market);
      const result = await dydxTradingService.closePosition(position.market, position, marketInfo);

      if (result.success) {
        alert('Position close order placed successfully!');
        // Position will be removed via websocket update
      } else {
        alert('Failed to close position: ' + result.userMessage);
      }
    } catch (error: any) {
      console.error('Failed to close position:', error);
      alert('Failed to close position: ' + error.message);
    } finally {
      setClosingPosition(null);
    }
  }, []);

  const handleCloseTriggers = useCallback(() => {
    setShowPriceTriggers(false);
    setSelectedPosition(null);
  }, []);

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <h3 className="text-lg font-semibold text-white mb-2">Connect Your Wallet</h3>
        <p className="text-gray-400 text-sm">Connect to view your positions</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        <span className="ml-3 text-gray-400">Loading positions...</span>
      </div>
    );
  }

  if (positions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <h3 className="text-lg font-semibold text-white mb-2">No Open Positions</h3>
        <p className="text-gray-400 text-sm">Your positions will appear here after trading</p>
      </div>
    );
  }

  return (
    <>
      <div className="h-full flex flex-col bg-primary">
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-secondary border-b border-gray-600">
              <tr className="text-gray-400 text-xs">
                <th className="text-left px-4 py-2 font-normal">Market</th>
                <th className="text-center px-4 py-2 font-normal">Side</th>
                <th className="text-right px-4 py-2 font-normal">Size</th>
                <th className="text-right px-4 py-2 font-normal">Entry Price</th>
                <th className="text-right px-4 py-2 font-normal">Unrealized PnL</th>
                <th className="text-right px-4 py-2 font-normal">Realized PnL</th>
                <th className="text-center px-4 py-2 font-normal">Actions</th>
              </tr>
            </thead>
            <tbody>
              {positions.map(position => {
                const unrealizedPnl = parseFloat(position.unrealizedPnl || '0');
                const realizedPnl = parseFloat(position.realizedPnl || '0');
                const size = parseFloat(position.size || '0');
                const entryPrice = parseFloat(position.entryPrice || '0');
                const isClosing = closingPosition === position.market;

                return (
                  <tr
                    key={position.market}
                    className={`border-b border-[#2a2a2a] hover:bg-[#1f1818] transition-colors ${isClosing ? 'opacity-50' : ''}`}
                  >
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center text-white text-xs font-bold">
                          {position.market?.split('-')[0]?.charAt(0) || 'C'}
                        </div>
                        <span className="text-white font-medium">
                          {position.market?.split('-')[0] || 'N/A'}
                        </span>
                      </div>
                    </td>

                    <td className="px-4 py-2 text-center">
                      <span
                        className={`px-2 py-1 rounded text-xs font-semibold ${
                          position.side === 'LONG'
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-red-500/20 text-red-400'
                        }`}
                      >
                        {position.side}
                      </span>
                    </td>

                    <td className="px-4 py-2 text-right text-white font-mono">
                      {Math.abs(size).toFixed(4)}
                    </td>

                    <td className="px-4 py-2 text-right text-white font-mono">
                      $
                      {entryPrice.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 6,
                      })}
                    </td>

                    <td className="px-4 py-2 text-right">
                      <span
                        className={`font-mono font-semibold ${
                          unrealizedPnl >= 0 ? 'text-green-400' : 'text-red-400'
                        }`}
                      >
                        {unrealizedPnl >= 0 ? '+' : ''}${unrealizedPnl.toFixed(2)}
                      </span>
                    </td>

                    <td className="px-4 py-2 text-right">
                      <span
                        className={`font-mono ${
                          realizedPnl >= 0 ? 'text-green-400' : 'text-red-400'
                        }`}
                      >
                        {realizedPnl >= 0 ? '+' : ''}${realizedPnl.toFixed(2)}
                      </span>
                    </td>

                    <td className="px-4 py-2 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleEditPosition(position)}
                          disabled={isClosing}
                          className="p-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Edit Position (Set TP/SL)"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleClosePosition(position)}
                          disabled={isClosing}
                          className="p-1.5 rounded bg-red-600 hover:bg-red-500 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                          title="Close Position"
                        >
                          {isClosing ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <X className="w-4 h-4" />
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
      </div>

      {selectedPosition && (
        <PriceTriggers
          isOpen={showPriceTriggers}
          onClose={handleCloseTriggers}
          position={selectedPosition}
          oraclePrice={
            oraclePrices[selectedPosition.market] || parseFloat(selectedPosition.entryPrice)
          }
          onSave={handleSaveTriggers}
        />
      )}
    </>
  );
};

export default PositionsPanel;
