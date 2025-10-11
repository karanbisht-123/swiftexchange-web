import { AlertCircle, CheckCircle, Edit, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useWalletStore } from '../../wallet/store.ts/walletStore';
import {
  ERROR_MESSAGES,
  // SUCCESS_MESSAGES,
  UI_STRINGS,
} from '../constants/tradeTransactionConstants';
import { useTradeTransaction } from '../hook/useTradeTransaction';
import { type ActiveOffer } from '../types/tradeTransaction.types';

// import PageLayout from "../../../components/layout/PageLayout";
const TradeTransactionUI = () => {
  const { walletAddresses, getPrivateKey } = useWalletStore();
  const stellarAddress = walletAddresses[1] || '';

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
    setCancelStatus(prev => ({ ...prev, [offer.id]: 'pending' }));
    setErrorMessage(null);

    try {
      const privateKey = await getPrivateKey('stellar');
      if (!privateKey) {
        throw new Error('Failed to retrieve private key');
      }

      await cancelOffer(offer, privateKey);
      setCancelStatus(prev => ({ ...prev, [offer.id]: 'success' }));
    } catch (err) {
      setCancelStatus(prev => ({ ...prev, [offer.id]: 'error' }));
      setErrorMessage(err instanceof Error ? err.message : ERROR_MESSAGES.CANCEL_OFFER_FAILED);
    }
  };

  const handleEditSubmit = async () => {
    if (!editingOffer) return;

    setEditStatus(prev => ({ ...prev, [editingOffer.id]: 'pending' }));
    setErrorMessage(null);

    try {
      const privateKey = await getPrivateKey('stellar');
      if (!privateKey) {
        throw new Error('Failed to retrieve private key');
      }

      await editOffer(editingOffer, privateKey, newAmount, newPrice);
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
    return trade_type === 'liquidity_pool' ? 'Liquidity Pool (AMM Swap)' : 'Order Book Trade';
  };

  return (
    <div className="bg-secondary border lg:border-none max-w-[95vw] lg:max-w-6xl mx-auto overflow-x-scroll  rounded-xl  mt-2 flex items-center justify-center p-4 sm:p-6">
      <div className="w-full p-6">
        <h2 className="heading-4 mb-4">Trade Transactions</h2>

        {/* Tabs */}
        <div className="flex gap-4 mb-6">
          <button
            className={`btn flex-1 ${activeTab === 'active' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveTab('active')}
          >
            {UI_STRINGS.ACTIVE_OFFERS_TITLE}
          </button>
          <button
            className={`btn flex-1 ${activeTab === 'completed' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setActiveTab('completed')}
          >
            {UI_STRINGS.COMPLETED_TRADES_TITLE}
          </button>
        </div>

        {/* Error Display */}
        {(error || errorMessage) && (
          <div className="card bg-danger-light border-danger p-4 mb-4 animate-fade-in">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-danger mt-0.5 flex-shrink-0" />
              <p className="text-sm text-danger">{error || errorMessage}</p>
            </div>
          </div>
        )}

        {activeTab === 'active' ? (
          <div>
            {activeOffers.length === 0 && !isLoading ? (
              <p className="text-muted text-center">{UI_STRINGS.NO_ACTIVE_OFFERS}</p>
            ) : (
              <table className="w-full text-sm text-text-primary overflow-x-auto">
                <thead>
                  <tr className="border-b border-border">
                    <th className="py-2 text-left">Selling</th>
                    <th className="py-2 text-left">Buying</th>
                    <th className="py-2 text-left">Amount</th>
                    <th className="py-2 text-left">Price</th>
                    <th className="py-2 text-left">Time</th>
                    <th className="py-2 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {activeOffers.map(offer => (
                    <tr key={offer.id} className="border-b border-border">
                      <td className="py-2">{offer.selling.code}</td>
                      <td className="py-2">{offer.buying.code}</td>
                      <td className="py-2">{parseFloat(offer.amount).toFixed(4)}</td>
                      <td className="py-2">{parseFloat(offer.price).toFixed(7)}</td>
                      <td className="py-2">{new Date(offer.lastModifiedTime).toLocaleString()}</td>
                      <td className="py-2 flex gap-2">
                        <button
                          onClick={() => setEditingOffer(offer)}
                          className="btn btn-primary btn-sm"
                          disabled={isLoading}
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        {cancelStatus[offer.id] === 'pending' ? (
                          <div className="w-4 h-4 border-2 border-text-inverse border-t-transparent rounded-full animate-spin" />
                        ) : cancelStatus[offer.id] === 'success' ? (
                          <CheckCircle className="w-4 h-4 text-success" />
                        ) : cancelStatus[offer.id] === 'error' ? (
                          <X className="w-4 h-4 text-danger" />
                        ) : (
                          <button
                            onClick={() => handleCancelOffer(offer)}
                            className="btn btn-danger btn-sm"
                            disabled={isLoading}
                          >
                            {UI_STRINGS.CANCEL}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {activePagination.hasMore && (
              <button
                onClick={loadMoreActive}
                className="btn btn-secondary w-full mt-4"
                disabled={isLoading}
              >
                {isLoading ? 'Loading...' : UI_STRINGS.LOAD_MORE}
              </button>
            )}
          </div>
        ) : (
          <div>
            {completedTrades.length === 0 && !isLoading ? (
              <p className="text-muted text-center">{UI_STRINGS.NO_COMPLETED_TRADES}</p>
            ) : (
              <table className="w-full text-sm text-text-primary overflow-x-auto">
                <thead>
                  <tr className="border-b border-border">
                    <th className="py-2 text-left">Type</th>
                    <th className="py-2 text-left">Trade Type</th>
                    <th className="py-2 text-left">Base Asset</th>
                    <th className="py-2 text-left">Counter Asset</th>
                    <th className="py-2 text-left">Amount</th>
                    <th className="py-2 text-left">Price</th>
                    <th className="py-2 text-left">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {completedTrades.map(trade => (
                    <tr key={trade.id} className="border-b border-border">
                      <td className="py-2">{trade.isBuy ? UI_STRINGS.BUY : UI_STRINGS.SELL}</td>
                      <td className="py-2">{getTradeTypeLabel(trade?.trade_type)}</td>
                      <td className="py-2">{trade.baseAsset.code}</td>
                      <td className="py-2">{trade.counterAsset.code}</td>
                      <td className="py-2">{parseFloat(trade.baseAmount).toFixed(4)}</td>
                      <td className="py-2">{parseFloat(trade.price).toFixed(7)}</td>
                      <td className="py-2">{new Date(trade.ledgerCloseTime).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {completedPagination.hasMore && (
              <button
                onClick={loadMoreCompleted}
                className="btn btn-secondary w-full mt-4"
                disabled={isLoading}
              >
                {isLoading ? 'Loading...' : UI_STRINGS.LOAD_MORE}
              </button>
            )}
          </div>
        )}

        {isLoading && !activeOffers.length && !completedTrades.length && (
          <div className="flex justify-center mt-4">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Edit Modal */}
        {editingOffer && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="card glass-effect p-6 w-96">
              <h3 className="heading-3 mb-4">Edit Offer</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-muted mb-2">
                    New Amount (Selling)
                  </label>
                  <input
                    type="number"
                    value={newAmount}
                    onChange={e => setNewAmount(e.target.value)}
                    className="input input-primary w-full"
                    step="0.0000001"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-muted mb-2">
                    New Price (Buying per Selling)
                  </label>
                  <input
                    type="number"
                    value={newPrice}
                    onChange={e => setNewPrice(e.target.value)}
                    className="input input-primary w-full"
                    step="0.0000001"
                  />
                </div>
              </div>
              <div className="flex gap-4 mt-6">
                <button onClick={() => setEditingOffer(null)} className="btn btn-ghost flex-1">
                  Cancel
                </button>
                <button
                  onClick={handleEditSubmit}
                  className="btn btn-primary flex-1"
                  disabled={editStatus[editingOffer.id] === 'pending'}
                >
                  {editStatus[editingOffer.id] === 'pending' ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="w-5 h-5 border-2 border-text-inverse border-t-transparent rounded-full animate-spin" />
                      Editing...
                    </span>
                  ) : (
                    'Save Changes'
                  )}
                </button>
              </div>
              {editStatus[editingOffer.id] === 'success' && (
                <div className="mt-4 text-success">Offer edited successfully!</div>
              )}
              {editStatus[editingOffer.id] === 'error' && (
                <div className="mt-4 text-danger">Failed to edit offer.</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TradeTransactionUI;
