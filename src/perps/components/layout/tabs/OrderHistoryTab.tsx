import React, { useState } from 'react';
import { useOrderHistory } from '../../../adapters/aster/hooks/useOrderHistory';

interface Props {
  signer: any;
  userAddr: string;
  asterSymbol: string;
}

export const OrderHistoryTab: React.FC<Props> = ({ signer, userAddr, asterSymbol }) => {
  const [hideOtherSymbols, setHideOtherSymbols] = useState(false);
  const { orders, isLoading } = useOrderHistory(signer, userAddr, hideOtherSymbols ? asterSymbol : null);

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
            <th className="px-4 py-2 font-medium">Type</th>
            <th className="px-4 py-2 font-medium">Symbol</th>
            <th className="px-4 py-2 font-medium">Side</th>
            <th className="px-4 py-2 font-medium">Price</th>
            <th className="px-4 py-2 font-medium">Amount</th>
            <th className="px-4 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <tr><td colSpan={7} className="px-4 py-8 text-center text-muted">Loading...</td></tr>
          ) : orders.length === 0 ? (
            <tr><td colSpan={7} className="px-4 py-8 text-center text-muted">No order history</td></tr>
          ) : (
            orders.map(o => (
              <tr key={o.orderId} className="border-b border-color hover:bg-hover">
                <td className="px-4 py-2 text-secondary">{new Date(o.updateTime || o.time || Date.now()).toLocaleString()}</td>
                <td className="px-4 py-2 text-primary uppercase">{o.type}</td>
                <td className="px-4 py-2 text-primary">{o.symbol}</td>
                <td className={`px-4 py-2 ${o.side === 'BUY' ? 'text-success' : 'text-danger'} uppercase`}>{o.side}</td>
                <td className="px-4 py-2 text-primary">{o.price}</td>
                <td className="px-4 py-2 text-primary">{o.executedQty} / {o.origQty}</td>
                <td className="px-4 py-2 text-secondary uppercase">{o.status}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};
