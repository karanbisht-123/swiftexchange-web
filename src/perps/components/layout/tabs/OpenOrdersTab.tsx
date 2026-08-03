import React, { useState } from 'react';
import { useOrderStore } from '../../../core/stores/orderStore';
import { useOrders } from '../../../adapters/aster/hooks/useOrders';
import { useWalletStore } from '../../../../modules/walletconnect/store/walletConnectStore';
interface Props {
  signer: any;
  userAddr: string;
}

export const OpenOrdersTab: React.FC<Props> = ({ signer, userAddr }) => {
  const orders = useOrderStore(state => state.orders);
  const displayOrders = Object.values(orders).filter(o => o.status === 'new' || o.status === 'partially_filled');
  const { cancel } = useOrders(signer, userAddr);

  const [cancelingId, setCancelingId] = useState<string | null>(null);

  const handleCancel = async (symbol: string, orderId: string) => {
    if (!signer) return;
    setCancelingId(orderId);
    try {
      await cancel({ symbol, orderId: parseInt(orderId, 10) });
      // Optimistically remove
      useOrderStore.getState().removeOrder(orderId);
    } catch (e) {
      console.error('Failed to cancel order:', e);
    } finally {
      setCancelingId(null);
    }
  };

  return (
    <div className="w-full h-full overflow-y-auto">
      <table className="w-full text-[11px] text-left whitespace-nowrap">
        <thead className="text-secondary border-b border-color sticky top-0 bg-primary z-10">
          <tr>
            <th className="px-4 py-2 font-medium">Time</th>
            <th className="px-4 py-2 font-medium">Type</th>
            <th className="px-4 py-2 font-medium">Symbol</th>
            <th className="px-4 py-2 font-medium">Side</th>
            <th className="px-4 py-2 font-medium">Price</th>
            <th className="px-4 py-2 font-medium">Amount</th>
            <th className="px-4 py-2 font-medium">Status</th>
            <th className="px-4 py-2 font-medium text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          {displayOrders.length === 0 ? (
            <tr><td colSpan={8} className="px-4 py-8 text-center text-muted">No open orders</td></tr>
          ) : (
            displayOrders.map(o => (
              <tr key={o.id} className="border-b border-color hover:bg-hover">
                <td className="px-4 py-2 text-secondary">{new Date(o.timestamp).toLocaleString()}</td>
                <td className="px-4 py-2 text-primary uppercase">{o.type}</td>
                <td className="px-4 py-2 text-primary">{o.symbol}</td>
                <td className={`px-4 py-2 ${o.side === 'buy' ? 'text-success' : 'text-danger'} uppercase`}>{o.side}</td>
                <td className="px-4 py-2 text-primary">{o.price}</td>
                <td className="px-4 py-2 text-primary">{o.filledSize} / {o.size}</td>
                <td className="px-4 py-2 text-secondary uppercase">{o.status}</td>
                <td className="px-4 py-2 text-right">
                  <button 
                    onClick={() => handleCancel(o.symbol.replace('-', ''), o.id)}
                    disabled={cancelingId === o.id}
                    className="text-[10px] bg-tertiary hover:bg-hover px-2 py-1 rounded text-primary disabled:opacity-50"
                  >
                    {cancelingId === o.id ? '...' : 'Cancel'}
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};
