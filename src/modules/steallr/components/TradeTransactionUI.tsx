import { AlertCircle, ArrowRight, ExternalLink, Search, Timer, X, } from 'lucide-react';
import { useEffect, useState } from 'react';

import { WalletType } from '../../walletconnect/constants/Wallet';
import { useWalletConnect } from '../../walletconnect/hooks/useWalletConnect';
import { ERROR_MESSAGES, UI_STRINGS } from '../constants/tradeTransactionConstants';
import { useTradeTransaction } from '../hook/useTradeTransaction';
import { type ActiveOffer } from '../types/tradeTransaction.types';

const TradeTransactionUI = () => {
  const { connectedWallets, getProvider } = useWalletConnect();
  const stellarWallet = connectedWallets[WalletType.STELLAR];
  const stellarAddress = stellarWallet?.address || '';

  const {
    activeOffers,
    completedTrades,
    activePagination,
    completedPagination,
    isLoading,
    error,
    // isStreaming,
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

  useEffect(() => {
    if (editingOffer) {
      setNewAmount(editingOffer.amount);
      setNewPrice(editingOffer.price);
    }
  }, [editingOffer]);

  const handleCancelOffer = async (offer: ActiveOffer) => {
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
      <div className="bg-secondary lg:rounded-xl border border-border/50 p-6 h-full flex flex-col items-center justify-center text-center">
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

      <div className="bg-secondary min-h-screen p-4 lg:rounded-2xl border border-white/5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="heading-4">Trade Transactions</h2>
              {/* Live streaming indicator */}
              {/* <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-semibold uppercase tracking-wider"
                style={{
                  borderColor: isStreaming ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.1)',
                  color: isStreaming ? 'rgb(34,197,94)' : 'var(--color-text-muted)',
                  backgroundColor: isStreaming ? 'rgba(34,197,94,0.08)' : 'transparent',
                }}>
                {isStreaming ? (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                    Live
                  </>
                ) : (
                  <>
                    <Zap className="w-2.5 h-2.5" />
                    Polling
                  </>
                )}
              </div> */}
            </div>
            <p className="text-muted text-sm mt-1">Manage your offers and view history</p>
          </div>
          <div className="p-1 bg-muted/30 border border-white/5 rounded-full inline-flex">
            <button
              onClick={() => setActiveTab('active')}
              className={`px-5 py-2 text-sm font-medium rounded-full transition-all duration-200 ${activeTab === 'active'
                ? 'bg-primary text-text-inverse shadow-lg'
                : 'text-muted hover:text-text-primary'
                }`}
            >
              Active Offers
              {activeOffers.length > 0 && (
                <span className="ml-2 px-1.5 py-0.5 rounded-full text-[10px] bg-white/10">
                  {activeOffers.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('completed')}
              className={`px-5 py-2 text-sm font-medium rounded-full transition-all duration-200 ${activeTab === 'completed'
                ? 'bg-primary text-text-inverse shadow-lg'
                : 'text-muted hover:text-text-primary'
                }`}
            >
              Completed Trades
            </button>
          </div>
        </div>

        {(error || errorMessage) && (
          <div className="mb-6 p-4 rounded-xl bg-danger/10 border border-danger/20 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-danger shrink-0 mt-0.5" />
            <p className="text-sm text-danger">{error || errorMessage}</p>
          </div>
        )}

        <div className="bg-muted/10 rounded-xl border border-white/5 overflow-hidden scrollbar-hide">
          {activeTab === 'active' ? (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto scrollbar-hide">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-white/5 bg-white/5">
                      <th className="px-6 py-4 text-xs font-semibold text-muted uppercase tracking-wider">Pair</th>
                      <th className="px-6 py-4 text-xs font-semibold text-muted uppercase tracking-wider">Amount</th>
                      <th className="px-6 py-4 text-xs font-semibold text-muted uppercase tracking-wider">Price</th>
                      <th className="px-6 py-4 text-xs font-semibold text-muted uppercase tracking-wider">Date</th>
                      <th className="px-6 py-4 text-xs font-semibold text-muted uppercase tracking-wider text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {activeOffers.length === 0 && !isLoading ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-muted">
                          <Search className="w-10 h-10 mx-auto mb-3 opacity-50" />
                          <p>{UI_STRINGS.NO_ACTIVE_OFFERS}</p>
                        </td>
                      </tr>
                    ) : (
                      activeOffers.map(offer => (
                        <tr
                          key={offer.id}
                          className={`transition-colors ${removingOfferIds.has(offer.id)
                            ? 'offer-exit opacity-40'
                            : newOfferIds.has(offer.id)
                              ? 'offer-new hover:bg-white/5'
                              : 'hover:bg-white/5'
                            }`}
                        >
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-text-primary">{offer.selling.code}</span>
                              <ArrowRight className="w-3 h-3 text-muted" />
                              <span className="font-semibold text-text-primary">{offer.buying.code}</span>
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <div className="text-xs text-success">Sell Offer</div>
                              {newOfferIds.has(offer.id) && (
                                <span className="text-[9px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full border border-green-500/30 font-bold uppercase">
                                  New
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-text-primary font-medium">{parseFloat(offer.amount).toFixed(4)}</span>
                            <span className="text-muted text-xs ml-1">{offer.selling.code}</span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-text-primary font-medium">{parseFloat(offer.price).toFixed(7)}</span>
                            <span className="text-muted text-xs ml-1">{offer.buying.code}</span>
                          </td>
                          <td className="px-6 py-4 text-sm text-muted">
                            {new Date(offer.lastModifiedTime).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => setEditingOffer(offer)}
                                disabled={isLoading || removingOfferIds.has(offer.id)}
                                className="text-xs px-3 py-1.5 rounded-lg border border-primary/20 text-primary hover:bg-primary/10 transition-colors bg-primary/5 disabled:opacity-40"
                              >
                                Edit
                              </button>
                              {cancelStatus[offer.id] === 'pending' || removingOfferIds.has(offer.id) ? (
                                <div className="w-5 h-5 border-2 border-danger border-t-transparent rounded-full animate-spin ml-2" />
                              ) : (
                                <button
                                  onClick={() => handleCancelOffer(offer)}
                                  disabled={isLoading}
                                  className="text-xs px-3 py-1.5 rounded-lg border border-danger/20 text-danger hover:bg-danger/10 transition-colors bg-danger/5"
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

              {/* Mobile Cards */}
              <div className="md:hidden space-y-3 p-3">
                {activeOffers.length === 0 && !isLoading ? (
                  <div className="text-center py-12 text-muted">
                    <Search className="w-10 h-10 mx-auto mb-3 opacity-50" />
                    <p>{UI_STRINGS.NO_ACTIVE_OFFERS}</p>
                  </div>
                ) : (
                  activeOffers.map(offer => (
                    <div
                      key={offer.id}
                      className={`rounded-xl p-4 border transition-all duration-300 ${removingOfferIds.has(offer.id)
                        ? 'offer-exit border-white/5 bg-white/5'
                        : newOfferIds.has(offer.id)
                          ? 'offer-new border-green-500/20 bg-green-500/5'
                          : 'border-white/5 bg-white/5'
                        }`}
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-text-primary">{offer.selling.code}</span>
                          <ArrowRight className="w-3 h-3 text-muted" />
                          <span className="font-bold text-text-primary">{offer.buying.code}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {newOfferIds.has(offer.id) && (
                            <span className="text-[9px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full border border-green-500/30 font-bold uppercase">
                              New
                            </span>
                          )}
                          <span className="text-[10px] bg-success/10 text-success px-2 py-0.5 rounded-full border border-success/20 uppercase font-semibold tracking-wide">
                            Sell Limit
                          </span>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                          <p className="text-[10px] text-muted uppercase tracking-wider mb-0.5">Amount</p>
                          <p className="text-sm font-medium text-text-primary">{parseFloat(offer.amount).toFixed(4)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-muted uppercase tracking-wider mb-0.5">Price</p>
                          <p className="text-sm font-medium text-text-primary">{parseFloat(offer.price).toFixed(7)}</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setEditingOffer(offer)}
                          disabled={isLoading || removingOfferIds.has(offer.id)}
                          className="flex-1 py-2 rounded-lg bg-primary/10 text-primary text-xs font-semibold border border-primary/20 disabled:opacity-40"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleCancelOffer(offer)}
                          disabled={isLoading || removingOfferIds.has(offer.id)}
                          className="flex-1 py-2 rounded-lg bg-danger/10 text-danger text-xs font-semibold border border-danger/20 disabled:opacity-40"
                        >
                          {cancelStatus[offer.id] === 'pending' || removingOfferIds.has(offer.id)
                            ? '...'
                            : 'Cancel'}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {activePagination.hasMore && (
                <div className="p-4 border-t border-white/5 text-center">
                  <button
                    onClick={loadMoreActive}
                    disabled={isLoading}
                    className="text-primary text-sm font-medium hover:text-primary-light transition-colors"
                  >
                    {isLoading ? 'Loading...' : 'Load More Offers'}
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-white/5 bg-white/5">
                      <th className="px-6 py-4 text-xs font-semibold text-muted uppercase tracking-wider">Type</th>
                      <th className="px-6 py-4 text-xs font-semibold text-muted uppercase tracking-wider">Pair</th>
                      <th className="px-6 py-4 text-xs font-semibold text-muted uppercase tracking-wider">Filled Amount</th>
                      <th className="px-6 py-4 text-xs font-semibold text-muted uppercase tracking-wider">Price</th>
                      <th className="px-6 py-4 text-xs font-semibold text-muted uppercase tracking-wider">Time</th>
                      <th className="px-6 py-4 text-xs font-semibold text-muted uppercase tracking-wider text-right">Hash</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {completedTrades.length === 0 && !isLoading ? (
                      <tr>
                        <td colSpan={6} className="px-6 py-12 text-center text-muted">
                          <Timer className="w-10 h-10 mx-auto mb-3 opacity-50" />
                          <p>{UI_STRINGS.NO_COMPLETED_TRADES}</p>
                        </td>
                      </tr>
                    ) : (
                      completedTrades.map(trade => (
                        <tr key={trade.id} className="hover:bg-white/5 transition-colors">
                          <td className="px-6 py-4">
                            <span
                              className={`text-xs px-2 py-0.5 rounded border ${trade.isBuy
                                ? 'border-success/20 text-success bg-success/5'
                                : 'border-danger/20 text-danger bg-danger/5'
                                }`}
                            >
                              {trade.isBuy ? 'Buy' : 'Sell'}
                            </span>
                            <div className="text-[10px] text-muted mt-1 uppercase">
                              {trade.trade_type === 'liquidity_pool' ? 'AMM Swap' : 'Order Book'}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-1.5 text-text-primary">
                              <span className="font-semibold">{trade.baseAsset.code}</span>
                              <span className="text-muted">/</span>
                              <span>{trade.counterAsset.code}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="font-medium text-text-primary">
                              {parseFloat(trade.baseAmount).toFixed(4)}{' '}
                              <span className="text-muted text-xs">{trade.baseAsset.code}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="font-medium text-text-primary">
                              {parseFloat(trade.price).toFixed(7)}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-sm text-muted">
                            <div className="flex flex-col">
                              <span>{new Date(trade.ledgerCloseTime).toLocaleDateString()}</span>
                              <span className="text-xs opacity-70">
                                {new Date(trade.ledgerCloseTime).toLocaleTimeString()}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <span
                              title={trade.id}
                              className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary-light cursor-pointer"
                              onClick={() => {
                                window.open(
                                  `https://stellar.expert/explorer/public/trade/${trade.id}`,
                                  '_blank'
                                );
                              }}
                            >
                              <span className="hidden sm:inline">View</span>
                              <ExternalLink className="w-3.5 h-3.5" />
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden space-y-3 p-3">
                {completedTrades.length === 0 && !isLoading ? (
                  <div className="text-center py-12 text-muted">
                    <Timer className="w-10 h-10 mx-auto mb-3 opacity-50" />
                    <p>{UI_STRINGS.NO_COMPLETED_TRADES}</p>
                  </div>
                ) : (
                  completedTrades.map(trade => (
                    <div key={trade.id} className="bg-white/5 rounded-xl p-4 border border-white/5">
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-text-primary">{trade.baseAsset.code}</span>
                          <span className="text-muted text-xs">/</span>
                          <span className="font-bold text-text-primary">{trade.counterAsset.code}</span>
                        </div>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full border uppercase font-semibold tracking-wide ${trade.isBuy
                            ? 'border-success/20 text-success bg-success/10'
                            : 'border-danger/20 text-danger bg-danger/10'
                            }`}
                        >
                          {trade.isBuy ? 'Buy' : 'Sell'}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-4 mb-3">
                        <div>
                          <p className="text-[10px] text-muted uppercase tracking-wider mb-0.5">Filled</p>
                          <p className="text-sm font-medium text-text-primary">
                            {parseFloat(trade.baseAmount).toFixed(4)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-muted uppercase tracking-wider mb-0.5">Price</p>
                          <p className="text-sm font-medium text-text-primary">
                            {parseFloat(trade.price).toFixed(7)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between pt-3 border-t border-white/5">
                        <div className="text-[10px] text-muted">
                          {new Date(trade.ledgerCloseTime).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                        <button
                          onClick={() => {
                            window.open(
                              `https://stellar.expert/explorer/testnet/trade/${trade.id}`,
                              '_blank'
                            );
                          }}
                          className="flex items-center gap-1.5 text-xs text-primary bg-primary/10 px-3 py-1.5 rounded-full hover:bg-primary/20 transition-colors"
                        >
                          View Hash <ExternalLink className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {completedPagination.hasMore && (
                <div className="p-4 border-t border-white/5 text-center">
                  <button
                    onClick={loadMoreCompleted}
                    disabled={isLoading}
                    className="text-primary text-sm font-medium hover:text-primary-light transition-colors"
                  >
                    {isLoading ? 'Loading...' : 'Load More Trades'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Edit Offer Modal */}
        {editingOffer && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-secondary border border-white/10 p-6 w-full max-w-md rounded-2xl shadow-xl">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-text-primary">Edit Active Offer</h3>
                <button
                  onClick={() => setEditingOffer(null)}
                  className="text-muted hover:text-text-primary transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-muted mb-1.5">
                    Update Amount ({editingOffer.selling.code})
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
                  <label className="block text-sm font-medium text-muted mb-1.5">
                    Update Price ({editingOffer.buying.code})
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
              <div className="flex gap-3 mt-8">
                <button
                  onClick={() => setEditingOffer(null)}
                  className="flex-1 py-3 px-4 rounded-xl text-sm font-medium border border-white/10 hover:bg-white/5 transition-all text-muted"
                >
                  Cancel
                </button>
                <button
                  onClick={handleEditSubmit}
                  disabled={editStatus[editingOffer.id] === 'pending'}
                  className="flex-1 py-3 px-4 rounded-xl text-sm font-medium bg-primary text-text-inverse hover:bg-primary-light transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2"
                >
                  {editStatus[editingOffer.id] === 'pending' ? (
                    <>
                      <div className="w-4 h-4 border-2 border-text-inverse/30 border-t-text-inverse rounded-full animate-spin" />
                      Updating...
                    </>
                  ) : (
                    'Confirm Update'
                  )}
                </button>
              </div>
              {editStatus[editingOffer.id] === 'error' && (
                <div className="mt-4 p-3 bg-danger/10 border border-danger/20 rounded-lg text-danger text-xs text-center">
                  Failed to update offer. Please try again.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default TradeTransactionUI;
