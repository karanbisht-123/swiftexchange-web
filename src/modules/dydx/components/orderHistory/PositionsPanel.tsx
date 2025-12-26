import { Edit2, Loader2, X } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';

import { getSocketClient } from '../../client/clients';
import { metadataService } from '../../hooks/useCoinGeckoMetadata';
import { type Position, dydxDataService } from '../../service/dydxOrderService';
import { dydxTradingService } from '../../service/dydxTradingService';
import { dydxWalletService } from '../../service/dydxWalletService';
import PriceTriggers, { type TriggerConfig } from '../PriceTriggers';

interface SubaccountWebSocketData {
  openPerpetualPositions?: Position[];
  orders?: any[];
  fills?: any[];
}

const PositionsPanel: React.FC = () => {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null);
  const [showPriceTriggers, setShowPriceTriggers] = useState(false);
  const [oraclePrices, setOraclePrices] = useState<Record<string, number>>({});
  const [closingPosition, setClosingPosition] = useState<string | null>(null);
  const [icons, setIcons] = useState<Record<string, string>>({});
  const [useWebSocket, setUseWebSocket] = useState(false); // Disabled by default
  const [wsConnected, setWsConnected] = useState(false);

  const address = dydxWalletService.getAddress();
  const subaccountNumber = dydxWalletService.getSubaccountNumber() ?? 0;
  const isConnected = !!address;

  // Fetch positions via HTTP
  const fetchPositions = useCallback(async () => {
    if (!isConnected) {
      setPositions([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const data = await dydxDataService.fetchPositions();
      setPositions(data);

      // Load icons for all position markets
      const markets = [...new Set(data.map(p => p.market))];
      const iconPromises = markets.map(async market => {
        const metadata = await metadataService.getMetadata(market);
        return { market, icon: metadata?.image };
      });

      const iconResults = await Promise.allSettled(iconPromises);
      const newIcons: Record<string, string> = {};

      iconResults.forEach(result => {
        if (result.status === 'fulfilled' && result.value.icon) {
          newIcons[result.value.market] = result.value.icon;
        }
      });

      setIcons(prev => ({ ...prev, ...newIcons }));
    } catch (error) {
      console.error('[PositionsPanel] Failed to fetch positions:', error);
    } finally {
      setLoading(false);
    }
  }, [isConnected]);

  // WebSocket subscription for real-time updates (optional, disabled by default)
  useEffect(() => {
    if (!isConnected || !useWebSocket) {
      setWsConnected(false);
      return;
    }

    console.log('[PositionsPanel] Subscribing to v4_subaccounts WebSocket');

    const socketClient = getSocketClient();

    const unsubscribe = socketClient.subscribeToSubaccounts(
      address!,
      subaccountNumber,
      (message: any) => {
        if (message.type === 'channel_data' && message.contents) {
          const data: SubaccountWebSocketData = message.contents;

          if (data.openPerpetualPositions) {
            console.log('[PositionsPanel] Received WebSocket position update');
            setPositions(data.openPerpetualPositions);
            setWsConnected(true);
          }
        }
      }
    );

    setWsConnected(socketClient.isConnected());

    return () => {
      console.log('[PositionsPanel] Unsubscribing from WebSocket');
      unsubscribe();
      setWsConnected(false);
    };
  }, [isConnected, useWebSocket, address, subaccountNumber]);

  // Initial HTTP fetch
  useEffect(() => {
    if (isConnected) {
      fetchPositions();
    }
  }, [isConnected, fetchPositions]);

  // Fallback polling when WebSocket is disabled
  useEffect(() => {
    if (!isConnected || useWebSocket) return;

    const interval = setInterval(fetchPositions, 10000);
    return () => clearInterval(interval);
  }, [isConnected, useWebSocket, fetchPositions]);

  // Fetch oracle prices for P&L calculations
  useEffect(() => {
    if (positions.length === 0) return;

    const marketTickers = [...new Set(positions.map(p => p.market))];
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

      const results = await Promise.allSettled(pricePromises);

      if (!isActive) return;

      const newPrices: Record<string, number> = {};
      results.forEach(result => {
        if (result.status === 'fulfilled' && result.value) {
          newPrices[result.value.ticker] = result.value.price;
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
  }, [positions]);

  const handleEditPosition = useCallback((position: Position) => {
    setSelectedPosition(position);
    setShowPriceTriggers(true);
  }, []);

  const handleSaveTriggers = useCallback(
    async (config: TriggerConfig) => {
      if (!selectedPosition) return;

      try {
        const marketInfo = await dydxTradingService.getMarketInfo(selectedPosition.market);

        const results = await dydxTradingService.setPositionTriggers(selectedPosition, marketInfo, {
          takeProfit: config.takeProfit?.enabled
            ? { price: config.takeProfit.price!, type: config.takeProfit.type }
            : undefined,
          stopLoss: config.stopLoss?.enabled
            ? { price: config.stopLoss.price!, type: config.stopLoss.type }
            : undefined,
        });

        const errors: string[] = [];
        if (results.takeProfitResult && !results.takeProfitResult.success) {
          errors.push(`TP: ${results.takeProfitResult.userMessage}`);
        }
        if (results.stopLossResult && !results.stopLossResult.success) {
          errors.push(`SL: ${results.stopLossResult.userMessage}`);
        }

        if (errors.length > 0) {
          alert('Some triggers failed:\n' + errors.join('\n'));
        } else {
          alert('Triggers set successfully!');
          setShowPriceTriggers(false);
        }
      } catch (error: any) {
        console.error('Failed to set triggers:', error);
        alert('Failed to set triggers: ' + (error.message || 'Unknown error'));
      }
    },
    [selectedPosition]
  );

  const handleClosePosition = useCallback(
    async (position: Position) => {
      if (!confirm(`Close ${position.side} position for ${position.market}?`)) return;

      setClosingPosition(position.market);
      try {
        const marketInfo = await dydxTradingService.getMarketInfo(position.market);
        const result = await dydxTradingService.closePosition(
          position.market,
          position,
          marketInfo
        );

        if (result.success) {
          alert('Position close order placed successfully!');
          setTimeout(fetchPositions, 2000);
        } else {
          alert('Failed to close position: ' + result.userMessage);
        }
      } catch (error: any) {
        console.error('Failed to close position:', error);
        alert('Failed to close position: ' + error.message);
      } finally {
        setClosingPosition(null);
      }
    },
    [fetchPositions]
  );

  const handleCloseTriggers = useCallback(() => {
    setShowPriceTriggers(false);
    setSelectedPosition(null);
  }, []);

  const getMarketIcon = useCallback(
    (market: string) => {
      const baseAsset = market.split('-')[0];
      const cachedIcon = icons[market];

      if (cachedIcon) {
        return (
          <img
            src={cachedIcon}
            alt={baseAsset}
            className="w-full h-full object-cover rounded-full"
            onError={e => {
              e.currentTarget.style.display = 'none';
              e.currentTarget.parentElement!.innerHTML = `<span class="text-white text-xs font-bold">${baseAsset.charAt(0)}</span>`;
            }}
          />
        );
      }

      return <span className="text-white text-xs font-bold">{baseAsset.charAt(0)}</span>;
    },
    [icons]
  );

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
        {/* Optional: Header with WebSocket toggle (hidden by default) */}
        {false && (
          <div className="px-4 py-2 bg-secondary border-b border-gray-700 flex items-center justify-between">
            <h2 className="text-white font-semibold">Positions</h2>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-gray-400 text-xs">Real-time updates:</span>
                <button
                  onClick={() => setUseWebSocket(!useWebSocket)}
                  className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                    useWebSocket ? 'bg-green-500/20 text-green-400' : 'bg-gray-600/20 text-gray-400'
                  }`}
                >
                  {useWebSocket ? 'WebSocket' : 'Polling'}
                </button>
              </div>
              {useWebSocket && (
                <div className="flex items-center gap-2">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      wsConnected ? 'bg-green-500' : 'bg-red-500'
                    }`}
                  />
                  <span className="text-xs text-gray-400">
                    {wsConnected ? 'Connected' : 'Disconnected'}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

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
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center">
                          {getMarketIcon(position.market)}
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
