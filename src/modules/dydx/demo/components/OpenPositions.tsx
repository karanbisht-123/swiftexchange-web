import { useEffect } from 'react';

import { usePositionService } from '../hook/usePositionService';
import { type Position } from '../types/types';

const OpenPositions: React.FC = () => {
  const { positions, isLoading, error, initializePositionService, fetchOpenPositions } =
    usePositionService();

  useEffect(() => {
    initializePositionService();
    fetchOpenPositions();
  }, [initializePositionService, fetchOpenPositions]);

  return (
    <div className="p-6 max-w-4xl mx-auto bg-gray-900 text-white rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold mb-4">Open Positions</h2>

      {isLoading && <div className="text-center text-gray-400">Loading positions...</div>}

      {error && <div className="text-center text-red-500">Error: {error}</div>}

      {!isLoading && !error && positions.length === 0 && (
        <div className="text-center text-gray-400">No open positions found.</div>
      )}

      {positions.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-800">
                <th className="p-3 text-sm font-semibold">Market</th>
                <th className="p-3 text-sm font-semibold">Side</th>
                <th className="p-3 text-sm font-semibold">Size</th>
                <th className="p-3 text-sm font-semibold">Entry Price</th>
                <th className="p-3 text-sm font-semibold">Unrealized PNL</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((position: Position, index: number) => (
                <tr
                  key={`${position.market}-${index}`}
                  className="border-b border-gray-700 hover:bg-gray-800"
                >
                  <td className="p-3">{position.market}</td>
                  <td
                    className={`p-3 ${
                      position.side === 'LONG' ? 'text-green-500' : 'text-red-500'
                    }`}
                  >
                    {position.side}
                  </td>
                  <td className="p-3">{position.size}</td>
                  <td className="p-3">${parseFloat(position.entryPrice).toFixed(2)}</td>
                  <td
                    className={`p-3 ${
                      parseFloat(position.unrealizedPnl) >= 0 ? 'text-green-500' : 'text-red-500'
                    }`}
                  >
                    ${parseFloat(position.unrealizedPnl).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default OpenPositions;
