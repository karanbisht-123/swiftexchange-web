import React, { useState } from 'react';
import { useAccountStore } from '../../../core/stores/accountStore';
import { useAssetLogos } from '../../../adapters/aster/hooks/useAssetLogos';
import { ConfirmationModal } from '../../../../components/common/ConfirmationModal';
import { RefreshCw } from 'lucide-react';

export const AssetsTab: React.FC = () => {
  const balances = useAccountStore(state => state.balances);
  const { logos } = useAssetLogos();
  
  const [rebalanceModalOpen, setRebalanceModalOpen] = useState(false);
  const [assetToRebalance, setAssetToRebalance] = useState<string | null>(null);

  const handleRebalanceClick = (asset: string) => {
    setAssetToRebalance(asset);
    setRebalanceModalOpen(true);
  };

  const handleConfirmRebalance = () => {
    console.log(`Rebalance triggered for ${assetToRebalance}`);
    // TODO: Wire up to Aster rebalance API endpoint once available
    setRebalanceModalOpen(false);
    setAssetToRebalance(null);
  };

  return (
    <div className="w-full h-full overflow-y-auto">
      <table className="w-full text-[11px] text-left">
        <thead className="text-secondary border-b border-color sticky top-0 bg-primary z-10">
          <tr>
            <th className="px-4 py-2 font-medium">Coin</th>
            <th className="px-4 py-2 font-medium">Total Balance</th>
            <th className="px-4 py-2 font-medium">Margin Balance</th>
            <th className="px-4 py-2 font-medium">Value</th>
            <th className="px-4 py-2 font-medium">Unrealized PNL</th>
          </tr>
        </thead>
        <tbody>
          {Object.values(balances).map(b => {
            const total = parseFloat(b.total);
            const isNegative = total < 0;
            return (
              <tr key={b.asset} className="border-b border-color hover:bg-hover">
                <td className="px-4 py-2 text-primary font-medium flex items-center gap-2">
                  {logos[b.asset] ? (
                    <img src={logos[b.asset]} alt={b.asset} className="w-4 h-4 rounded-full" />
                  ) : (
                    <div className="w-4 h-4 rounded-full bg-tertiary" />
                  )}
                  {b.asset}
                </td>
                <td className="px-4 py-2 text-primary">
                  <div className="flex items-center gap-2">
                    <span className={isNegative ? 'text-danger' : ''}>{b.total}</span>
                    {isNegative && (
                      <button 
                        onClick={() => handleRebalanceClick(b.asset)}
                        className="text-danger hover:opacity-80 transition-opacity"
                        title="Rebalance Asset"
                      >
                        <RefreshCw size={12} />
                      </button>
                    )}
                  </div>
                </td>
                <td className="px-4 py-2 text-primary">{b.marginBalance || b.available}</td>
                <td className="px-4 py-2 text-primary">${total.toFixed(2)}</td>
                <td className={`px-4 py-2 ${parseFloat(b.unrealizedPnl || '0') > 0 ? 'text-success' : parseFloat(b.unrealizedPnl || '0') < 0 ? 'text-danger' : 'text-primary'}`}>
                  {b.unrealizedPnl || '0.00'}
                </td>
              </tr>
            );
          })}
          {Object.keys(balances).length === 0 && (
            <tr><td colSpan={5} className="px-4 py-8 text-center text-muted">No balances found</td></tr>
          )}
        </tbody>
      </table>

      <ConfirmationModal
        isOpen={rebalanceModalOpen}
        title="Rebalance Assets"
        message={`Your available ${assetToRebalance} assets are negative. Do you want to rebalance your assets?`}
        onConfirm={handleConfirmRebalance}
        onCancel={() => {
          setRebalanceModalOpen(false);
          setAssetToRebalance(null);
        }}
        confirmText="Confirm"
        confirmButtonType="primary"
      />
    </div>
  );
};
