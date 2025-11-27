import { X } from 'lucide-react';
import React, { useEffect, useState } from 'react';

import { dydxWalletService } from '../../service/dydxWalletService';

interface Position {
  market: string;
  side: 'LONG' | 'SHORT';
  size: string;
  entryPrice: string;
  unrealizedPnl: string;
  realizedPnl: string;
  liquidationPrice?: string;
  leverage?: string;
}

const PositionsPanel: React.FC = () => {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);

  const address = dydxWalletService.getAddress();
  const subNo = dydxWalletService.getSubaccountNumber();
  const indexer = dydxWalletService.getIndexerClient();
  const isConnected = !!address;

  useEffect(() => {
    if (!address || !indexer) {
      setLoading(false);
      return;
    }

    const fetchPositions = async () => {
      setLoading(true);
      try {
        const subaccount = await indexer.account.getSubaccount(address, subNo);
        const openPositions = subaccount?.subaccount?.openPerpetualPositions;
        if (openPositions && typeof openPositions === 'object') {
          const positionsArray = Object.values(openPositions) as Position[];
          setPositions(positionsArray);
        } else {
          setPositions([]);
        }
      } catch (error) {
        console.error('Error fetching positions:', error);
        setPositions([]);
      } finally {
        setLoading(false);
      }
    };

    fetchPositions();
    const interval = setInterval(fetchPositions, 30000);
    return () => clearInterval(interval);
  }, [address, indexer, subNo]);

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
        <div className="text-gray-400">Loading positions...</div>
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

              return (
                <tr
                  key={position.market}
                  className="border-b border-[#2a2a2a] hover:bg-[#1f1818] transition-colors"
                >
                  {/* Market */}
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

                  {/* Side */}
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

                  {/* Size */}
                  <td className="px-4 py-2 text-right text-white font-mono">
                    {Math.abs(size).toFixed(4)}
                  </td>

                  {/* Entry Price */}
                  <td className="px-4 py-2 text-right text-white font-mono">
                    $
                    {entryPrice.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 6,
                    })}
                  </td>

                  {/* Unrealized PnL */}
                  <td className="px-4 py-2 text-right">
                    <span
                      className={`font-mono font-semibold ${
                        unrealizedPnl >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}
                    >
                      {unrealizedPnl >= 0 ? '+' : ''}${unrealizedPnl.toFixed(2)}
                    </span>
                  </td>

                  {/* Realized PnL */}
                  <td className="px-4 py-2 text-right">
                    <span
                      className={`font-mono ${
                        realizedPnl >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}
                    >
                      {realizedPnl >= 0 ? '+' : ''}${realizedPnl.toFixed(2)}
                    </span>
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-2 text-center">
                    <button
                      className="p-1.5 rounded bg-red-600 hover:bg-red-500 text-white transition-colors"
                      title="Close Position"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default PositionsPanel;
