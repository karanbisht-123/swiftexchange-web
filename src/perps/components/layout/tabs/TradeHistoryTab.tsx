import React, { useState } from 'react';
import { useTradeHistory } from '../../../adapters/aster/hooks/useTradeHistory';

interface Props {
  signer: any;
  userAddr: string;
  asterSymbol: string;
}

export const TradeHistoryTab: React.FC<Props> = ({ signer, userAddr, asterSymbol }) => {
  const [hideOtherSymbols, setHideOtherSymbols] = useState(false);
  const { trades, isLoading } = useTradeHistory(signer, userAddr, hideOtherSymbols ? asterSymbol : null);

  return (
    <div className="w-full h-full overflow-y-auto relative">
      <div className="flex justify-end p-2 bg-primary border-b border-color sticky top-0 z-20">
        <label className="flex items-center gap-2 text-[11px] text-secondary cursor-pointer hover:text-white transition-colors">
          <input 
            type="checkbox" 
            checked={hideOtherSymbols} 
            onChange={(e) => setHideOtherSymbols(e.target.checked)}
            className="accent-[#E0A865]"
          />
          Hide other symbols
        </label>
      </div>
      <table className="w-full text-[11px] text-left whitespace-nowrap">
        <thead className="text-secondary border-b border-color sticky top-[36px] bg-primary z-10">
          <tr>
            <th className="px-4 py-2 font-medium">Time</th>
            <th className="px-4 py-2 font-medium">Symbol</th>
            <th className="px-4 py-2 font-medium">Side</th>
            <th className="px-4 py-2 font-medium">Order price</th>
            <th className="px-4 py-2 font-medium">Executed amount</th>
            <th className="px-4 py-2 font-medium">Fee</th>
            <th className="px-4 py-2 font-medium">Realized profit</th>
            <th className="px-4 py-2 font-medium">Role</th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <tr><td colSpan={8} className="px-4 py-8 text-center text-muted">Loading...</td></tr>
          ) : trades.length === 0 ? (
            <tr><td colSpan={8} className="px-4 py-8 text-center text-muted">No trade history</td></tr>
          ) : (
            trades.map(t => (
              <tr key={t.id} className="border-b border-color hover:bg-hover">
                <td className="px-4 py-2 text-secondary">{new Date(t.time).toLocaleString()}</td>
                <td className="px-4 py-2 text-primary">{t.symbol}</td>
                <td className={`px-4 py-2 ${t.side.toLowerCase() === 'buy' ? 'text-success' : 'text-danger'} uppercase`}>{t.side}</td>
                <td className="px-4 py-2 text-primary">{t.price}</td>
                <td className="px-4 py-2 text-primary">{t.qty}</td>
                <td className="px-4 py-2 text-primary">{t.commission} {t.commissionAsset}</td>
                <td className={`px-4 py-2 ${parseFloat(t.realizedPnl) > 0 ? 'text-success' : parseFloat(t.realizedPnl) < 0 ? 'text-danger' : 'text-primary'}`}>{t.realizedPnl}</td>
                <td className="px-4 py-2 text-secondary">{t.maker ? 'Maker' : 'Taker'}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};
