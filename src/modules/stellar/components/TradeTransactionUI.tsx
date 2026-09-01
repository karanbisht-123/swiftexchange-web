import { AlertCircle, ArrowRight, ExternalLink, Loader2, Search, Timer, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { ConfirmationModal } from '../../../components/common/ConfirmationModal';
import { getExplorerUrl as getRegistryExplorerUrl } from '../../evm/utils/Chainregistry';
import { WalletType } from '../../walletconnect/constants/Wallet';
import { useWalletConnect } from '../../walletconnect/hooks/useWalletConnect';
import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import { ERROR_MESSAGES, UI_STRINGS } from '../constants/tradeTransactionConstants';
import { useTradeTransaction } from '../hook/useTradeTransaction';
import { type ActiveOffer } from '../types/tradeTransaction.types';

const TradeTransactionUI = () => {
  const { connectedWallets, getProvider } = useWalletConnect();
  const network = useWalletStore(state => state.network);
  const stellarWallet = connectedWallets[WalletType.STELLAR];
  const stellarAddress = stellarWallet?.address || '';

  const {
    activeOffers,
    completedTrades,
    activePagination,
    completedPagination,
    isLoadingActive,
    isLoadingCompleted,
    error,
    newOfferIds,
    removingOfferIds,
    fetchActiveOffers,
    fetchCompletedTrades,
    cancelOffer,
    editOffer,
  } = useTradeTransaction({
    userAddress: stellarAddress,
  });

  const [activeTab, setActiveTab] = useState<'active' | 'completed'>('active');
  const [cancelStatus, setCancelStatus] = useState<{
    [key: string]: 'pending' | 'success' | 'error';
  }>({});
  const [editStatus, setEditStatus] = useState<{
    [key: string]: 'pending' | 'success' | 'error';
  }>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [editingOffer, setEditingOffer] = useState<ActiveOffer | null>(null);
  const [newAmount, setNewAmount] = useState('');
  const [newPrice, setNewPrice] = useState('');

  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [offerToCancel, setOfferToCancel] = useState<ActiveOffer | null>(null);

  const chainId = network === 'mainnet' ? 'pubnet' : 'testnet';
  const getExplorerUrl = (type: 'trade' | 'offer' | 'tx' | 'op', id: string) =>
    getRegistryExplorerUrl(chainId, type as any, id);

  useEffect(() => {
    if (editingOffer) {
      setNewAmount(editingOffer.amount);
      setNewPrice(editingOffer.price);
    }
  }, [editingOffer]);

  const handleCancelClick = (offer: ActiveOffer) => {
    setOfferToCancel(offer);
    setIsCancelModalOpen(true);
  };

  const handleConfirmCancel = async () => {
    if (!offerToCancel) return;
    const offer = offerToCancel;
    setIsCancelModalOpen(false);
    setOfferToCancel(null);

    if (!stellarWallet) {
      setErrorMessage('Please connect your Stellar wallet');
      return;
    }

    const provider = getProvider(WalletType.STELLAR);
    if (!provider) {
      setErrorMessage('Stellar wallet provider not available');
      return;
    }

    setCancelStatus(prev => ({ ...prev, [offer.id]: 'pending' }));
    setErrorMessage(null);

    try {
      await cancelOffer(offer, provider);
      setCancelStatus(prev => ({ ...prev, [offer.id]: 'success' }));
    } catch (err) {
      setCancelStatus(prev => ({ ...prev, [offer.id]: 'error' }));
      setErrorMessage(err instanceof Error ? err.message : ERROR_MESSAGES.CANCEL_OFFER_FAILED);
    }
  };

  const handleEditSubmit = async () => {
    if (!editingOffer || !stellarWallet) {
      setErrorMessage('Please connect your Stellar wallet');
      return;
    }

    const provider = getProvider(WalletType.STELLAR);
    if (!provider) {
      setErrorMessage('Stellar wallet provider not available');
      return;
    }

    setEditStatus(prev => ({ ...prev, [editingOffer.id]: 'pending' }));
    setErrorMessage(null);

    try {
      await editOffer(editingOffer, provider, newAmount, newPrice);
      setEditStatus(prev => ({ ...prev, [editingOffer.id]: 'success' }));
      setEditingOffer(null);
    } catch (err) {
      setEditStatus(prev => ({ ...prev, [editingOffer.id]: 'error' }));
      setErrorMessage(err instanceof Error ? err.message : 'Failed to edit offer');
    }
  };

  const loadMoreActive = () => {
    if (activePagination.hasMore && activePagination.cursor) {
      fetchActiveOffers(activePagination.cursor);
    }
  };

  const loadMoreCompleted = () => {
    if (completedPagination.hasMore && completedPagination.cursor) {
      fetchCompletedTrades(completedPagination.cursor);
    }
  };

  if (!stellarWallet) {
    return (
      <div className="bg-secondary lg:rounded-xl  p-6 h-full flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 rounded-full bg-warning/10 flex items-center justify-center mb-4">
          <AlertCircle className="w-8 h-8 text-warning" />
        </div>
        <h4 className="heading-4 mb-2">Connect Wallet</h4>
        <p className="text-muted max-w-xs mx-auto">
          Please connect your Stellar wallet to view your trade history and active offers.
        </p>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @keyframes offer-fade-in {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes offer-fade-out {
          from { opacity: 1; transform: translateY(0); }
          to   { opacity: 0; transform: translateY(-6px); }
        }
        @keyframes offer-flash {
          0%, 100% { background-color: transparent; }
          25%       { background-color: rgba(34,197,94,0.12); }
          75%       { background-color: rgba(34,197,94,0.06); }
        }
        .offer-new   { animation: offer-fade-in 0.3s ease, offer-flash 2s ease; }
        .offer-exit  { animation: offer-fade-out 0.35s ease forwards; pointer-events: none; }
        @keyframes trade-slide-in {
          from { opacity: 0; transform: translateX(-8px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        .trade-new { animation: trade-slide-in 0.3s ease; }
      `}</style>

      <div className="bg-[var(--color-bg-secondary)] rounded-2xl border border-[var(--color-border)]/60 p-4 lg:p-6 shadow-sm">
        <div className="flex items-center justify-between pb-3 lg:pb-0 lg:mb-8 border-b border-[var(--color-border)]/40 lg:border-0">
          <h2 className="text-base font-bold text-text-primary lg:text-lg">Trade Transactions</h2>
          <div className="flex items-center gap-1 p-0.5 bg-primary rounded-lg lg:p-1">
            <button
              onClick={() => setActiveTab('active')}
              className={`px-3 py-1 lg:px-5 lg:py-2 text-xs font-semibold lg:text-sm rounded-md transition-all duration-200 ${
                activeTab === 'active' ? 'bg-brand text-white text-text-inverse' : 'text-muted'
              }`}
            >
              Active
            </button>
            <button
              onClick={() => setActiveTab('completed')}
              className={`px-3 py-1 lg:px-5 lg:py-2 text-xs font-semibold lg:text-sm rounded-md transition-all duration-200 ${
                activeTab === 'completed' ? 'bg-brand text-white text-text-inverse' : 'text-muted'
              }`}
            >
              Completed
            </button>
          </div>
        </div>

        {(error || errorMessage) && (
          <div className="mx-4 mt-4 lg:mx-0 mb-4 p-3 rounded-xl bg-danger/10 border border-danger/20 flex items-start gap-3">
            <AlertCircle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
            <p className="text-xs text-danger">{error || errorMessage}</p>
          </div>
        )}

        <div className="lg:bg-muted/10 lg:rounded-xl lg:border lg:border-white/5 lg:overflow-hidden scrollbar-hide">
          {((activeTab === 'active' && isLoadingActive && activeOffers.length === 0) ||
            (activeTab === 'completed' && isLoadingCompleted && completedTrades.length === 0)) && (
            <div className="flex flex-col items-center justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-primary mb-3" />
              <p className="text-muted text-sm">Loading...</p>
            </div>
          )}

          {activeTab === 'active' ? (
            <>
              <div className="hidden md:block overflow-x-auto scrollbar-hide">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-color bg-primary">
                      <th className="px-6 py-3.5 text-[10px] font-black text-muted uppercase tracking-[0.15em]">
                        Pair
                      </th>
                      <th className="px-6 py-3.5 text-[10px] font-black text-muted uppercase tracking-[0.15em]">
                        Amount
                      </th>
                      <th className="px-6 py-3.5 text-[10px] font-black text-muted uppercase tracking-[0.15em]">
                        Price
                      </th>
                      <th className="px-6 py-3.5 text-[10px] font-black text-muted uppercase tracking-[0.15em]">
                        Date
                      </th>
                      <th className="px-6 py-3.5 text-[10px] font-black text-muted uppercase tracking-[0.15em] text-right">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {activeOffers.length === 0 && !isLoadingActive ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-muted">
                          <Search className="w-8 h-8 mx-auto mb-3 opacity-30 text-muted" />
                          <p className="text-xs uppercase tracking-widest font-black text-muted">
                            {UI_STRINGS.NO_ACTIVE_OFFERS}
                          </p>
                        </td>
                      </tr>
                    ) : (
                      activeOffers.map((offer, idx) => (
                        <tr
                          key={`${offer.id}-${idx}`}
                          className={`transition-colors border-b border-color hover:bg-primary/10 ${
                            removingOfferIds.has(offer.id)
                              ? 'opacity-40 pointer-events-none grayscale-[0.5]'
                              : newOfferIds.has(offer.id)
                                ? 'offer-new'
                                : ''
                          }`}
                        >
                          <td className="px-6 py-3">
                            <div className="flex items-center gap-1.5 text-text-primary">
                              <span className="font-bold text-sm">{offer.selling.code}</span>
                              <ArrowRight className="w-3 h-3 text-muted" />
                              <span className="text-muted text-xs font-semibold">
                                {offer.buying.code}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 mt-1">
                              <span className="text-[9px] font-black uppercase tracking-wider text-green-400 bg-green-500/10 border border-green-500/20 px-1.5 py-0.5 rounded w-fit">
                                Sell Offer
                              </span>
                              {newOfferIds.has(offer.id) && (
                                <span className="text-[9px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded border border-green-500/30 font-bold uppercase">
                                  New
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-3">
                            <div className="text-sm font-bold text-text-primary">
                              {parseFloat(offer.amount).toFixed(4)}
                              <span className="text-muted text-[10px] font-bold ml-1">
                                {offer.selling.code}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-3">
                            <div className="font-mono text-xs font-semibold text-text-primary">
                              {parseFloat(offer.price).toFixed(7)}
                              <span className="text-muted text-[10px] font-bold ml-1">
                                {offer.buying.code}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-3 text-xs font-semibold text-muted">
                            {new Date(offer.lastModifiedTime).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => setEditingOffer(offer)}
                                disabled={isLoadingActive || removingOfferIds.has(offer.id)}
                                className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-md border border-brand/35 text-brand bg-brand/5 hover:bg-brand/10 transition-colors disabled:opacity-40"
                              >
                                Edit
                              </button>
                              {cancelStatus[offer.id] === 'pending' ||
                              removingOfferIds.has(offer.id) ? (
                                <div className="w-4 h-4 border-2 border-danger border-t-transparent rounded-full animate-spin ml-2" />
                              ) : (
                                <button
                                  onClick={() => handleCancelClick(offer)}
                                  disabled={isLoadingActive}
                                  className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-md border border-danger/30 text-danger bg-danger/5 hover:bg-danger/10 transition-colors"
                                >
                                  Cancel
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="md:hidden">
                {activeOffers.length === 0 && !isLoadingActive ? (
                  <div className="text-center py-16 text-muted">
                    <Search className="w-10 h-10 mx-auto mb-3 opacity-50" />
                    <p className="text-sm">{UI_STRINGS.NO_ACTIVE_OFFERS}</p>
                  </div>
                ) : (
                  <div className="divide-y divide-white/5">
                    {activeOffers.map((offer, idx) => (
                      <div
                        key={`${offer.id}-${idx}`}
                        className={`px-4 py-3.5 transition-all duration-300 ${
                          removingOfferIds.has(offer.id)
                            ? 'opacity-40 grayscale-[0.5]'
                            : newOfferIds.has(offer.id)
                              ? 'offer-new'
                              : ''
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-sm text-text-primary">
                              {offer.selling.code}
                            </span>
                            <ArrowRight className="w-3 h-3 text-muted" />
                            <span className="font-bold text-sm text-text-primary">
                              {offer.buying.code}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {newOfferIds.has(offer.id) && (
                              <span className="text-[8px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full font-bold uppercase">
                                New
                              </span>
                            )}
                            <span className="text-[8px] bg-success/10 text-success px-1.5 py-0.5 rounded-full uppercase font-semibold tracking-wide">
                              Sell
                            </span>
                          </div>
                        </div>
                        <div className="flex items-end justify-between mb-3">
                          <div>
                            <p className="text-[10px] text-muted uppercase tracking-wider mb-0.5">
                              Amount
                            </p>
                            <p className="text-sm font-semibold text-text-primary tabular-nums">
                              {parseFloat(offer.amount).toFixed(4)}
                              <span className="text-muted text-[10px] font-medium ml-1">
                                {offer.selling.code}
                              </span>
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] text-muted uppercase tracking-wider mb-0.5">
                              Price
                            </p>
                            <p className="text-sm font-semibold text-text-primary font-mono tabular-nums">
                              {parseFloat(offer.price).toFixed(7)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setEditingOffer(offer)}
                            disabled={isLoadingActive || removingOfferIds.has(offer.id)}
                            className="flex-1 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-semibold disabled:opacity-40 active:scale-[0.97] transition-transform"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleCancelClick(offer)}
                            disabled={isLoadingActive || removingOfferIds.has(offer.id)}
                            className="flex-1 py-1.5 rounded-lg bg-danger/10 text-danger text-xs font-semibold disabled:opacity-40 active:scale-[0.97] transition-transform"
                          >
                            {cancelStatus[offer.id] === 'pending' ||
                            removingOfferIds.has(offer.id) ? (
                              <span className="inline-block w-3 h-3 border-2 border-danger border-t-transparent rounded-full animate-spin" />
                            ) : (
                              'Cancel'
                            )}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {activePagination.hasMore && (
                <div className="p-4 border-t border-white/5 text-center">
                  <button
                    onClick={loadMoreActive}
                    disabled={isLoadingActive}
                    className="text-primary text-sm font-medium hover:text-primary-light transition-colors"
                  >
                    {isLoadingActive ? 'Loading...' : 'Load More Offers'}
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-color bg-primary">
                      <th className="px-6 py-3.5 text-[10px] font-black text-muted uppercase tracking-[0.15em]">
                        Type
                      </th>
                      <th className="px-6 py-3.5 text-[10px] font-black text-muted uppercase tracking-[0.15em]">
                        Pair
                      </th>
                      <th className="px-6 py-3.5 text-[10px] font-black text-muted uppercase tracking-[0.15em]">
                        Filled Amount
                      </th>
                      <th className="px-6 py-3.5 text-[10px] font-black text-muted uppercase tracking-[0.15em]">
                        Price
                      </th>
                      <th className="px-6 py-3.5 text-[10px] font-black text-muted uppercase tracking-[0.15em]">
                        Time
                      </th>
                      <th className="px-6 py-3.5 text-[10px] font-black text-muted uppercase tracking-[0.15em] text-right">
                        Hash
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {completedTrades.length === 0 && !isLoadingCompleted ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-muted">
                          <Timer className="w-8 h-8 mx-auto mb-3 opacity-30 text-muted" />
                          <p className="text-xs uppercase tracking-widest font-black text-muted">
                            {UI_STRINGS.NO_COMPLETED_TRADES}
                          </p>
                        </td>
                      </tr>
                    ) : (
                      completedTrades.map((trade, idx) => (
                        <tr
                          key={`${trade.id}-${idx}`}
                          className="border-b border-color hover:bg-primary/10 transition-colors"
                        >
                          <td className="px-6 py-3">
                            <span
                              className={`text-[9px] px-2 py-0.5 rounded border font-black uppercase tracking-wider ${
                                trade.isBuy
                                  ? 'border-success/20 text-success bg-success/5'
                                  : 'border-danger/20 text-danger bg-danger/5'
                              }`}
                            >
                              {trade.isBuy ? 'Buy' : 'Sell'}
                            </span>
                            <div className="text-[9px] font-bold text-muted uppercase tracking-wider mt-1">
                              {trade.trade_type === 'liquidity_pool' ||
                              trade.trade_type === 'path_payment'
                                ? 'AMM Swap'
                                : 'Order Book'}
                            </div>
                          </td>
                          <td className="px-6 py-3">
                            <div className="flex items-center gap-1.5 text-text-primary">
                              <span className="font-bold text-sm">{trade.baseAsset.code}</span>
                              <span className="text-muted text-xs">/</span>
                              <span className="text-muted text-xs font-semibold">
                                {trade.counterAsset.code}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-3">
                            <div className="font-bold text-sm text-text-primary">
                              {parseFloat(trade.baseAmount).toFixed(4)}{' '}
                              <span className="text-muted text-[10px] font-bold ml-1">
                                {trade.baseAsset.code}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-3">
                            <div className="font-mono text-xs font-semibold text-text-primary">
                              {parseFloat(trade.price).toFixed(7)}
                            </div>
                          </td>
                          <td className="px-6 py-3">
                            <div className="flex flex-col text-xs">
                              <span className="font-semibold text-text-primary">
                                {new Date(trade.ledgerCloseTime).toLocaleDateString()}
                              </span>
                              <span className="text-[10px] text-muted font-medium mt-0.5">
                                {new Date(trade.ledgerCloseTime).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-3 text-right">
                            <span
                              title={trade.id}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-brand bg-brand/10 border border-brand/20 rounded-md hover:bg-brand/20 transition-all cursor-pointer"
                              onClick={() => {
                                if (trade.operationId) {
                                  window.open(getExplorerUrl('op', trade.operationId), '_blank');
                                } else {
                                  const hash = trade.transactionHash || trade.id;
                                  const type = trade.transactionHash ? 'tx' : 'trade';
                                  window.open(getExplorerUrl(type, hash), '_blank');
                                }
                              }}
                            >
                              <span>View</span>
                              <ExternalLink className="w-3 h-3" />
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              <div className="md:hidden">
                {completedTrades.length === 0 && !isLoadingCompleted ? (
                  <div className="text-center py-16 text-muted">
                    <Timer className="w-10 h-10 mx-auto mb-3 opacity-50" />
                    <p className="text-sm">{UI_STRINGS.NO_COMPLETED_TRADES}</p>
                  </div>
                ) : (
                  <div className="divide-y divide-white/5">
                    {completedTrades.map((trade, idx) => (
                      <div key={`${trade.id}-${idx}`} className="px-4 py-3.5">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-sm text-text-primary">
                              {trade.baseAsset.code}
                            </span>
                            <span className="text-muted text-xs">/</span>
                            <span className="font-bold text-sm text-text-primary">
                              {trade.counterAsset.code}
                            </span>
                          </div>
                          <span
                            className={`text-[8px] px-1.5 py-0.5 rounded-full uppercase font-semibold tracking-wide ${
                              trade.trade_type === 'path_payment'
                                ? 'border-primary/20 text-primary bg-primary/10 border'
                                : trade.isBuy
                                  ? 'border-success/20 text-success bg-success/10 border'
                                  : 'border-danger/20 text-danger bg-danger/10 border'
                            }`}
                          >
                            {trade.trade_type === 'path_payment'
                              ? 'Swap'
                              : trade.isBuy
                                ? 'Buy'
                                : 'Sell'}
                          </span>
                        </div>
                        <div className="flex items-end justify-between mb-2.5">
                          <div>
                            <p className="text-[10px] text-muted uppercase tracking-wider mb-0.5">
                              Filled
                            </p>
                            <p className="text-sm font-semibold text-text-primary tabular-nums">
                              {parseFloat(trade.baseAmount).toFixed(4)}
                              <span className="text-muted text-[10px] font-medium ml-1">
                                {trade.baseAsset.code}
                              </span>
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] text-muted uppercase tracking-wider mb-0.5">
                              Price
                            </p>
                            <p className="text-sm font-semibold text-text-primary font-mono tabular-nums">
                              {parseFloat(trade.price).toFixed(7)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-muted tabular-nums">
                            {new Date(trade.ledgerCloseTime).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                          <button
                            onClick={() => {
                              if (trade.operationId) {
                                window.open(getExplorerUrl('op', trade.operationId), '_blank');
                              } else {
                                const hash = trade.transactionHash || trade.id;
                                const type = trade.transactionHash ? 'tx' : 'trade';
                                window.open(getExplorerUrl(type, hash), '_blank');
                              }
                            }}
                            className="flex items-center gap-1 text-xs text-primary font-semibold active:scale-[0.97] transition-transform"
                          >
                            View <ExternalLink className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {completedPagination.hasMore && (
                <div className="p-4 border-t border-white/5 text-center">
                  <button
                    onClick={loadMoreCompleted}
                    disabled={isLoadingCompleted}
                    className="text-primary text-sm font-medium hover:text-primary-light transition-colors"
                  >
                    {isLoadingCompleted ? 'Loading...' : 'Load More Trades'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {editingOffer && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50">
            <div className="bg-secondary border-t sm:border border-white/10 p-5 w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-base font-bold text-text-primary">Edit Offer</h3>
                <button
                  onClick={() => setEditingOffer(null)}
                  className="text-muted hover:text-text-primary transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-muted mb-1.5">
                    Amount ({editingOffer.selling.code})
                  </label>
                  <input
                    type="number"
                    value={newAmount}
                    onChange={e => setNewAmount(e.target.value)}
                    className="w-full bg-muted/20 border border-white/5 rounded-xl px-4 py-3 text-text-primary focus:outline-none focus:border-primary/50 transition-all font-mono text-sm"
                    step="0.0000001"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted mb-1.5">
                    Price ({editingOffer.buying.code})
                  </label>
                  <input
                    type="number"
                    value={newPrice}
                    onChange={e => setNewPrice(e.target.value)}
                    className="w-full bg-muted/20 border border-white/5 rounded-xl px-4 py-3 text-text-primary focus:outline-none focus:border-primary/50 transition-all font-mono text-sm"
                    step="0.0000001"
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setEditingOffer(null)}
                  className="flex-1 py-3 px-4 rounded-xl text-sm font-medium border border-white/10 hover:bg-white/5 transition-all text-muted"
                >
                  Cancel
                </button>
                <button
                  onClick={handleEditSubmit}
                  disabled={editStatus[editingOffer.id] === 'pending'}
                  className="flex-1 py-3 px-4 rounded-xl text-sm font-medium bg-primary text-text-inverse hover:bg-primary-light transition-all flex items-center justify-center gap-2"
                >
                  {editStatus[editingOffer.id] === 'pending' ? (
                    <>
                      <div className="w-4 h-4 border-2 border-text-inverse/30 border-t-text-inverse rounded-full animate-spin" />
                      Updating...
                    </>
                  ) : (
                    'Update'
                  )}
                </button>
              </div>
              {editStatus[editingOffer.id] === 'error' && (
                <div className="mt-3 p-3 bg-danger/10 border border-danger/20 rounded-lg text-danger text-xs text-center">
                  Failed to update. Try again.
                </div>
              )}
            </div>
          </div>
        )}

        <ConfirmationModal
          isOpen={isCancelModalOpen}
          title="Cancel Offer"
          message={
            <div className="space-y-2">
              <p>Are you sure you want to cancel this offer?</p>
              {offerToCancel && (
                <div className="p-3 bg-white/5 rounded-lg border border-white/5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted">Pair:</span>
                    <span className="font-medium text-text-primary">
                      {offerToCancel.selling.code} / {offerToCancel.buying.code}
                    </span>
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-muted">Amount:</span>
                    <span className="font-medium text-text-primary">
                      {parseFloat(offerToCancel.amount).toFixed(4)} {offerToCancel.selling.code}
                    </span>
                  </div>
                </div>
              )}
            </div>
          }
          onConfirm={handleConfirmCancel}
          onCancel={() => {
            setIsCancelModalOpen(false);
            setOfferToCancel(null);
          }}
          confirmText="Yes, Cancel"
          cancelText="No, Keep It"
          confirmButtonType="danger"
        />
      </div>
    </>
  );
};

export default TradeTransactionUI;
