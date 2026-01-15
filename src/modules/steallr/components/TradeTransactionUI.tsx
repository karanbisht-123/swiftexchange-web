import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  Clock,
  DollarSign,
  Edit,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
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
    fetchActiveOffers,
    fetchCompletedTrades,
    cancelOffer,
    editOffer,
  } = useTradeTransaction({
    networkKey: 'testnet',
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

  const getTradeTypeLabel = (trade_type: string) => {
    return trade_type === 'liquidity_pool' ? 'AMM Swap' : 'Order Book';
  };

  const getTradeIcon = (isBuy: boolean) => {
    return isBuy ? (
      <TrendingUp className="w-5 h-5 text-success" />
    ) : (
      <TrendingDown className="w-5 h-5 text-danger" />
    );
  };

  const getOfferIcon = () => {
    return <DollarSign className="w-5 h-5 text-primary" />;
  };

  const getArrowIcon = (isBuy: boolean) => {
    return isBuy ? <ArrowRight className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />;
  };

  if (!stellarWallet) {
    return (
      <div className="bg-secondary rounded-xl border lg:border-none p-6 h-full flex items-center justify-center">
        <div className="w-full max-w-lg text-center space-y-4">
          <AlertCircle className="w-16 h-16 text-warning mx-auto" />
          <h4 className="heading-4">Stellar Wallet Not Connected</h4>
          <p className="text-muted">Please connect your Stellar wallet to view transactions</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-secondary min-h-screen p-2 sm:p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="heading-4">Trade History</h2>
        {isLoading && (
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        )}
      </div>

      {/* Tab Switch - Segmented Line Style */}
      <div className="flex bg-muted rounded-full p-1 mb-6">
        <button
          onClick={() => setActiveTab('active')}
          className={`flex-1 px-4 py-2 rounded-full text-sm font-medium transition-all ${activeTab === 'active'
              ? 'bg-primary text-text-inverse shadow-md'
              : 'text-muted hover:bg-muted/50'
            }`}
        >
          Active Offers
        </button>
        <button
          onClick={() => setActiveTab('completed')}
          className={`flex-1 px-4 py-2 rounded-full text-sm font-medium transition-all ${activeTab === 'completed'
              ? 'bg-primary text-text-inverse shadow-md'
              : 'text-muted hover:bg-muted/50'
            }`}
        >
          Completed Trades
        </button>
      </div>

      {/* Error Display */}
      {(error || errorMessage) && (
        <div className="card bg-danger-light border-danger p-4 mb-4 rounded-xl animate-fade-in">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-danger mt-0.5 flex-shrink-0" />
            <p className="text-sm text-danger flex-1">{error || errorMessage}</p>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="space-y-4">
        {activeTab === 'active' ? (
          <>
            {activeOffers.length === 0 && !isLoading ? (
              <div className="text-center py-12">
                <DollarSign className="w-12 h-12 text-muted mx-auto mb-4" />
                <p className="text-muted">{UI_STRINGS.NO_ACTIVE_OFFERS}</p>
              </div>
            ) : (
              activeOffers.map(offer => (
                <div
                  key={offer.id}
                  className="card glass-effect rounded-xl p-4 border border-border/50"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      {getOfferIcon()}
                      <div>
                        <p className="font-semibold text-sm">Active Offer</p>
                        <p className="text-xs text-muted">
                          {new Date(offer.lastModifiedTime).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setEditingOffer(offer)}
                        className="btn btn-primary btn-sm p-2"
                        disabled={isLoading}
                        title="Edit Offer"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      {cancelStatus[offer.id] === 'pending' ? (
                        <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      ) : cancelStatus[offer.id] === 'success' ? (
                        <CheckCircle className="w-5 h-5 text-success" />
                      ) : cancelStatus[offer.id] === 'error' ? (
                        <X className="w-5 h-5 text-danger" />
                      ) : (
                        <button
                          onClick={() => handleCancelOffer(offer)}
                          className="btn btn-danger btn-sm p-2"
                          disabled={isLoading}
                          title="Cancel Offer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mb-3">
                    <div className="text-center">
                      <p className="text-xs text-muted mb-1">Selling</p>
                      <p className="font-semibold">{offer.selling.code}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted mb-1">Buying</p>
                      <p className="font-semibold">{offer.buying.code}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="text-center">
                      <p className="text-xs text-muted">Amount</p>
                      <p className="font-semibold">{parseFloat(offer.amount).toFixed(4)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted">Price</p>
                      <p className="font-semibold">{parseFloat(offer.price).toFixed(7)}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
            {activePagination.hasMore && (
              <button
                onClick={loadMoreActive}
                className="btn btn-secondary w-full rounded-xl"
                disabled={isLoading}
              >
                {isLoading ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    Loading...
                  </div>
                ) : (
                  UI_STRINGS.LOAD_MORE
                )}
              </button>
            )}
          </>
        ) : (
          <>
            {completedTrades.length === 0 && !isLoading ? (
              <div className="text-center py-12">
                <Clock className="w-12 h-12 text-muted mx-auto mb-4" />
                <p className="text-muted">{UI_STRINGS.NO_COMPLETED_TRADES}</p>
              </div>
            ) : (
              completedTrades.map(trade => (
                <div
                  key={trade.id}
                  className="card glass-effect rounded-xl p-4 border border-border/50"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      {getTradeIcon(trade.isBuy)}
                      <div>
                        <p className="font-semibold text-sm">
                          {trade.isBuy ? 'Buy' : 'Sell'} {trade.baseAsset.code}
                        </p>
                        <p className="text-xs text-muted">{getTradeTypeLabel(trade.trade_type)}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end">
                      <p className="text-xs text-muted mb-1">
                        {new Date(trade.ledgerCloseTime).toLocaleDateString()}
                      </p>
                      <p className="text-xs text-muted">
                        {new Date(trade.ledgerCloseTime).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="flex-1 text-center">
                      <p className="text-xs text-muted">{trade.baseAsset.code}</p>
                      <p className="font-semibold text-lg">{getArrowIcon(trade.isBuy)}</p>
                      <p className="text-xs text-muted">{trade.counterAsset.code}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted mb-1">Amount</p>
                      <p className="font-semibold">{parseFloat(trade.baseAmount).toFixed(4)}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-3 border-t border-border/50">
                    <p className="text-xs text-muted">Price</p>
                    <p className="font-semibold">{parseFloat(trade.price).toFixed(7)}</p>
                  </div>
                </div>
              ))
            )}
            {completedPagination.hasMore && (
              <button
                onClick={loadMoreCompleted}
                className="btn btn-secondary w-full rounded-xl"
                disabled={isLoading}
              >
                {isLoading ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    Loading...
                  </div>
                ) : (
                  UI_STRINGS.LOAD_MORE
                )}
              </button>
            )}
          </>
        )}
      </div>

      {/* Edit Modal */}
      {editingOffer && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="card glass-effect p-6 w-full max-w-md rounded-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="heading-3">Edit Offer</h3>
              <button onClick={() => setEditingOffer(null)} className="btn btn-ghost p-1">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-muted mb-2">
                  New Amount ({editingOffer.selling.code})
                </label>
                <input
                  type="number"
                  value={newAmount}
                  onChange={e => setNewAmount(e.target.value)}
                  className="input input-primary w-full rounded-lg"
                  step="0.0000001"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-muted mb-2">
                  New Price ({editingOffer.buying.code} per {editingOffer.selling.code})
                </label>
                <input
                  type="number"
                  value={newPrice}
                  onChange={e => setNewPrice(e.target.value)}
                  className="input input-primary w-full rounded-lg"
                  step="0.0000001"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setEditingOffer(null)}
                className="btn btn-ghost flex-1 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleEditSubmit}
                className="btn btn-primary flex-1 rounded-lg"
                disabled={editStatus[editingOffer.id] === 'pending'}
              >
                {editStatus[editingOffer.id] === 'pending' ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="w-5 h-5 border-2 border-text-inverse border-t-transparent rounded-full animate-spin" />
                    Saving...
                  </span>
                ) : (
                  'Save Changes'
                )}
              </button>
            </div>
            {editStatus[editingOffer.id] === 'success' && (
              <div className="mt-4 p-3 bg-success/10 border border-success rounded-lg text-success text-sm text-center">
                Offer edited successfully!
              </div>
            )}
            {editStatus[editingOffer.id] === 'error' && (
              <div className="mt-4 p-3 bg-danger/10 border border-danger rounded-lg text-danger text-sm text-center">
                Failed to edit offer.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default TradeTransactionUI;
