import { ArrowRightLeft, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import React, { useState } from 'react';

import { useNotificationStore } from '../../../../../store/notificationStore';
import { changeMultiAssetsMargin, getAccountInfo } from '../../../adapters/aster/api/account';
import { useAssetLogos } from '../../../adapters/aster/hooks/useAssetLogos';
import { useAsterAgent } from '../../../adapters/aster/hooks/useAsterAgent';
import { useAccountStore } from '../../../core/stores/accountStore';
import { getCoinIconUrl } from '../../../services/coinIconService';
import { Modal } from '../../ui/Modal';

export const AssetsTab: React.FC = () => {
  const balances = useAccountStore(state => state.balances);
  const multiAssetsMargin = useAccountStore(state => state.multiAssetsMargin);
  const setMultiAssetsMargin = useAccountStore(state => state.setMultiAssetsMargin);
  const setBalances = useAccountStore(state => state.setBalances);

  const { asterSigner, userAddr } = useAsterAgent();
  const { logos } = useAssetLogos();

  const [rebalanceModalOpen, setRebalanceModalOpen] = useState(false);
  const [assetToRebalance, setAssetToRebalance] = useState<string | null>(null);
  const [isRebalancing, setIsRebalancing] = useState(false);

  const handleRebalanceClick = (asset: string) => {
    setAssetToRebalance(asset);
    setRebalanceModalOpen(true);
  };

  const handleConfirmRebalance = async () => {
    if (!assetToRebalance) return;

    setIsRebalancing(true);
    try {
      if (asterSigner && userAddr) {
        // 1. Enable Multi-Assets Mode via official FAPI endpoint (POST /fapi/v3/multiAssetsMargin)
        if (!multiAssetsMargin) {
          await changeMultiAssetsMargin(asterSigner, userAddr, true);
          setMultiAssetsMargin(true);
        }

        // 2. Fetch fresh account snapshot to reflect updated balances (GET /fapi/v3/account)
        const accountInfo = await getAccountInfo(asterSigner, userAddr);
        if (accountInfo?.assets) {
          const mappedBalances = accountInfo.assets.map((a: any) => ({
            asset: a.asset,
            total: a.walletBalance,
            available: a.availableBalance || a.crossWalletBalance || '0',
            locked: String(
              parseFloat(a.walletBalance || '0') -
                parseFloat(a.availableBalance || a.crossWalletBalance || '0')
            ),
            marginBalance: a.marginBalance || a.crossWalletBalance || a.walletBalance || '0',
            unrealizedPnl: a.unrealizedProfit || '0',
          }));
          setBalances(mappedBalances);
        }

        useNotificationStore.getState().showToast({
          type: 'DYDX',
          title: 'Rebalance Configured',
          message: `Multi-Asset auto-exchange is enabled. Aster engine will automatically balance ${assetToRebalance} against other collateral.`,
        });
      } else {
        setMultiAssetsMargin(true);
        useNotificationStore.getState().showToast({
          type: 'DYDX',
          title: 'Rebalance Configured',
          message: `Multi-Asset margin enabled for ${assetToRebalance}.`,
        });
      }

      setRebalanceModalOpen(false);
      setAssetToRebalance(null);
    } catch (err: any) {
      console.error('Rebalance error:', err);
      useNotificationStore.getState().showToast({
        type: 'DYDX',
        title: 'Rebalance Error',
        message: err?.message || 'Failed to rebalance asset. Please try again.',
      });
    } finally {
      setIsRebalancing(false);
    }
  };

  const targetBalance = assetToRebalance ? balances[assetToRebalance] : null;

  return (
    <div className="w-full h-full overflow-x-auto overflow-y-auto scrollbar-thin">
      <table className="w-full text-[11px] text-left whitespace-nowrap">
        <thead className="text-secondary border-b border-color sticky top-0 bg-secondary z-10">
          <tr>
            <th className="px-2.5 py-1.5 font-medium">Coin</th>
            <th className="px-2.5 py-1.5 font-medium">Total Balance</th>
            <th className="px-2.5 py-1.5 font-medium">Margin Balance</th>
            <th className="px-2.5 py-1.5 font-medium">Value</th>
            <th className="px-2.5 py-1.5 font-medium">Unrealized PNL</th>
          </tr>
        </thead>
        <tbody>
          {Object.values(balances).map(b => {
            const total = parseFloat(b.total || '0');
            const isNegative = total < 0;
            const iconUrl = logos[b.asset] || getCoinIconUrl(b.asset) || undefined;

            return (
              <tr key={b.asset} className="border-b border-color hover:bg-hover transition-colors">
                <td className="px-2.5 py-1.5 text-primary font-medium flex items-center gap-2">
                  {iconUrl ? (
                    <img
                      src={iconUrl}
                      alt={b.asset}
                      className="w-3.5 h-3.5 rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-3.5 h-3.5 rounded-full bg-tertiary shrink-0" />
                  )}
                  <span>{b.asset}</span>
                </td>
                <td className="px-2.5 py-1.5 text-primary font-mono">
                  <div className="flex items-center gap-1.5">
                    <span className={isNegative ? 'text-danger font-medium' : ''}>{b.total}</span>
                    {isNegative && (
                      <button
                        type="button"
                        onClick={() => handleRebalanceClick(b.asset)}
                        className="flex items-center gap-1 text-[10px] text-danger bg-danger/10 hover:bg-danger/20 border border-danger/30 px-1.5 py-0.5 rounded transition-all cursor-pointer"
                        title="Rebalance Asset with Aster Multi-Asset Engine"
                      >
                        <RefreshCw size={10} className="shrink-0" />
                        <span>Rebalance</span>
                      </button>
                    )}
                  </div>
                </td>
                <td className="px-2.5 py-1.5 text-primary font-mono">
                  {b.marginBalance || b.available}
                </td>
                <td className="px-2.5 py-1.5 text-primary font-mono">${total.toFixed(2)}</td>
                <td
                  className={`px-2.5 py-1.5 font-mono ${
                    parseFloat(b.unrealizedPnl || '0') > 0
                      ? 'text-success'
                      : parseFloat(b.unrealizedPnl || '0') < 0
                        ? 'text-danger'
                        : 'text-primary'
                  }`}
                >
                  {b.unrealizedPnl || '0.00'}
                </td>
              </tr>
            );
          })}
          {Object.keys(balances).length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-8 text-center text-muted">
                No balances found
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Rebalance Modal */}
      <Modal
        isOpen={rebalanceModalOpen}
        onClose={() => {
          if (!isRebalancing) {
            setRebalanceModalOpen(false);
            setAssetToRebalance(null);
          }
        }}
        title={`Rebalance ${assetToRebalance || ''} Balance`}
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3.5 bg-tertiary rounded-xl border border-color">
            <div className="p-2 bg-brand/10 text-brand rounded-lg shrink-0 mt-0.5">
              <ArrowRightLeft size={18} />
            </div>
            <div className="space-y-1 text-[12px]">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-primary">Negative Available Balance</span>
                <span className="text-danger font-mono font-bold">
                  {targetBalance?.total} {assetToRebalance}
                </span>
              </div>
              <p className="text-secondary text-[11px] leading-relaxed">
                Aster automatically manages deficits by converting other collateral assets in your
                account into <span className="text-primary font-semibold">{assetToRebalance}</span>{' '}
                with zero additional trading commission.
              </p>
            </div>
          </div>

          <div className="p-3 bg-secondary rounded-xl border border-color space-y-2 text-[11px]">
            <div className="flex items-center justify-between text-secondary">
              <span>Multi-Assets Mode Status:</span>
              <span
                className={`font-semibold ${multiAssetsMargin ? 'text-success' : 'text-warning'}`}
              >
                {multiAssetsMargin ? 'Enabled' : 'Disabled (Will be enabled)'}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-muted text-[10px]">
              <CheckCircle2 size={12} className="text-success shrink-0" />
              <span>
                Matching engine automatically balances negative margin across all positions.
              </span>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                setRebalanceModalOpen(false);
                setAssetToRebalance(null);
              }}
              disabled={isRebalancing}
              className="flex-1 py-2.5 bg-tertiary hover:bg-hover text-secondary hover:text-primary rounded-lg font-medium text-[12px] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmRebalance}
              disabled={isRebalancing}
              className="flex-1 py-2.5 bg-brand hover:bg-brand-hover text-white rounded-lg font-bold text-[12px] transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50"
            >
              {isRebalancing ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  <span>Rebalancing...</span>
                </>
              ) : (
                <>
                  <RefreshCw size={13} />
                  <span>Confirm Rebalance</span>
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
