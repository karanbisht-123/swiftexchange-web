import React, { useEffect, useState } from 'react';

import { dydxWalletService } from '../../service/dydxWalletService';

interface Fill {
  id: string;
  market: string;
  side: 'BUY' | 'SELL';
  size: string;
  price: string;
  fee: string;
  createdAt: string;
  liquidity: 'TAKER' | 'MAKER';
  type: string;
}

const FillsPanel: React.FC = () => {
  const [fills, setFills] = useState<Fill[]>([]);
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

    const fetchFills = async () => {
      setLoading(true);
      try {
        const response = await indexer.account.getSubaccountFills(
          address!,
          subNo,
          undefined,
          undefined,
          100
        );

        console.log('Fetched fills:', response.fills);

        const fillsData: Fill[] = (response.fills || [])
          .map((f: any) => ({
            id: f.id,
            market: f.market,
            side: f.side.toUpperCase() as 'BUY' | 'SELL',
            size: f.size,
            price: f.price,
            fee: f.fee,
            createdAt: f.createdAt,
            liquidity: f.liquidity,
            type: f.type || 'LIMIT',
          }))
          .sort(
            (a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );

        setFills(fillsData);
      } catch (error) {
        console.error('Error fetching fills:', error);
        setFills([]);
      } finally {
        setLoading(false);
      }
    };

    fetchFills();
    const interval = setInterval(fetchFills, 30_000);
    return () => clearInterval(interval);
  }, [address, indexer, subNo]);

  const getTimeAgo = (timestamp: string) => {
    const now = Date.now();
    const diff = now - new Date(timestamp).getTime();
    const minutes = Math.floor(diff / 60_000);
    const hours = Math.floor(diff / 3_600_000);
    const days = Math.floor(diff / 86_400_000);
    const weeks = Math.floor(diff / 604_800_000);

    if (minutes < 60) return `${minutes}m`;
    if (hours < 24) return `${hours}h`;
    if (days < 7) return `${days}d`;
    return `${weeks}w`;
  };

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <h3 className="text-lg font-semibold text-white mb-2">Connect Your Wallet</h3>
        <p className="text-gray-400 text-sm">Connect to view your trade fills</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-400">Loading fills...</div>
      </div>
    );
  }

  if (fills.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center">
        <h3 className="text-lg font-semibold text-white mb-2">No Fills Yet</h3>
        <p className="text-gray-400 text-sm">Your trade fills will appear here</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-primary">
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-secondary border-b border-[#2a2a2a] z-10">
            <tr className="text-gray-400 text-xs">
              <th className="text-left px-4 py-3 font-normal">Market</th>
              <th className="text-center px-4 py-3 font-normal">Side</th>
              <th className="text-right px-4 py-3 font-normal">Size</th>
              <th className="text-right px-4 py-3 font-normal">Price</th>
              <th className="text-right px-4 py-3 font-normal">Total</th>
              <th className="text-right px-4 py-3 font-normal">Fee</th>
              <th className="text-center px-4 py-3 font-normal">Liquidity</th>
              <th className="text-right px-4 py-3 font-normal">Time</th>
            </tr>
          </thead>
          <tbody>
            {fills.map(fill => {
              const total = (parseFloat(fill.size) * parseFloat(fill.price)).toFixed(2);
              const feeAbs = Math.abs(parseFloat(fill.fee)).toFixed(4);

              return (
                <tr
                  key={fill.id}
                  className="border-b border-[#2a2a2a] hover:bg-[#1a1a1a] transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-xs font-bold">
                        {fill.market.split('-')[0]?.charAt(0) || 'C'}
                      </div>
                      <span className="text-white font-medium">{fill.market.split('-')[0]}</span>
                    </div>
                  </td>

                  <td className="px-4 py-3 text-center">
                    <span
                      className={`font-medium ${
                        fill.side === 'BUY' ? 'text-green-400' : 'text-red-400'
                      }`}
                    >
                      {fill.side}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-white font-mono">
                    {parseFloat(fill.size).toFixed(4)}
                  </td>
                  <td className="px-4 py-3 text-right text-white font-mono">
                    ${parseFloat(fill.price).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-white font-mono">${total}</td>
                  <td className="px-4 py-3 text-right text-red-400 font-mono">${feeAbs}</td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium ${
                        fill.liquidity === 'MAKER'
                          ? 'bg-blue-500/20 text-blue-400'
                          : 'bg-purple-500/20 text-purple-400'
                      }`}
                    >
                      {fill.liquidity}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-400 text-xs">
                    {getTimeAgo(fill.createdAt)}
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

export default FillsPanel;
