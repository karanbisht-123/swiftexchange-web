import { ArrowLeft, Check, Copy, CreditCard } from 'lucide-react';
import React, { useEffect, useState } from 'react';

import {
  Asset,
  BASE_FEE,
  Horizon,
  Memo,
  Networks,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import QRCode from 'qrcode';

import { getStellarConfig } from '../../../walletconnect/config/chains';
import { WalletType } from '../../../walletconnect/constants/Wallet';
import { useWalletConnect } from '../../../walletconnect/hooks/useWalletConnect';
import { useWalletStore } from '../../../walletconnect/store/walletConnectStore';
import { signAndSubmitTransaction } from '../../utils/transactionService';
import { addLocalTransaction } from '../../../evm/service/localTransactionService';
import StellarTransactionModal from '../modals/StellarTransactionModal';

interface DisplayAsset {
  name: string;
  ticker: string;
  price: number | null;
  quantity: number;
  network: string;
  iconUrl: string;
  issuer?: string;
}

interface StellarSendReceiveProps {
  asset: DisplayAsset;
  userAddress: string;
  onBack: () => void;
}

const StellarSendReceive: React.FC<StellarSendReceiveProps> = ({ asset, userAddress, onBack }) => {
  const [activeTab, setActiveTab] = useState<'send' | 'receive'>('send');
  const [destination, setDestination] = useState('');
  const [amount, setAmount] = useState('');
  const [memo, setMemo] = useState('');
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [isCopied, setIsCopied] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [txModal, setTxModal] = useState<{
    isOpen: boolean;
    status: 'success' | 'error';
    hash?: string;
    error?: string;
  }>({ isOpen: false, status: 'success' });

  const currentNetwork = useWalletStore(state => state.network);
  const { getProvider } = useWalletConnect();

  useEffect(() => {
    if (activeTab === 'receive' && userAddress) {
      QRCode.toDataURL(userAddress)
        .then(url => setQrCodeUrl(url))
        .catch(err => console.error(err));
    }
  }, [activeTab, userAddress]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(userAddress);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleSend = async () => {
    if (!destination || !amount || !userAddress) return;

    const provider = getProvider(WalletType.STELLAR);
    if (!provider) {
      alert('Wallet provider not found');
      return;
    }

    setIsSending(true);
    try {
      const config = getStellarConfig(currentNetwork);
      if (!config) throw new Error('Network config not found');

      const server = new Horizon.Server(config.horizonUrl, {
        allowHttp: config.horizonUrl.startsWith('http://'),
      });

      const sourceAccount = await server.loadAccount(userAddress);
      const networkPassphrase = config.networkPassphrase || Networks.TESTNET;

      const sendAsset =
        asset.ticker === 'XLM' ? Asset.native() : new Asset(asset.ticker, asset.issuer || '');

      const transactionBuilder = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE,
        networkPassphrase,
      })
        .addOperation(
          Operation.payment({
            destination: destination,
            asset: sendAsset,
            amount: amount.toString(),
          })
        )
        .setTimeout(30);

      if (memo) {
        transactionBuilder.addMemo(Memo.text(memo));
      }

      const transaction = transactionBuilder.build();

      const result = await signAndSubmitTransaction({
        xdr: transaction.toXDR(),
        network: currentNetwork,
        networkPassphrase,
        provider,
      });

      if (result.success) {
        addLocalTransaction({
          hash: result.hash || '',
          chainId: 9000000,
          type: 'send',
          timestamp: Date.now(),
          description: `Sent ${amount} ${asset.ticker} to ${destination.slice(0, 4)}...${destination.slice(-4)}`,
          status: 'success',
        });

        setTxModal({
          isOpen: true,
          status: 'success',
          hash: result.hash,
        });
      } else {
        throw new Error(result.error || 'Transaction failed');
      }
    } catch (error: any) {
      console.error(error);
      setTxModal({
        isOpen: true,
        status: 'error',
        error: error?.message || 'Transaction failed',
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleMax = () => {
    setAmount(asset.quantity.toString());
  };

  return (
    <div className="bg-secondary w-full flex flex-col h-full min-h-[400px]">
      <div className="p-4 border-b border-color flex items-center gap-4 bg-tertiary">
        <button onClick={onBack} className="p-2 hover:bg-hover rounded-full transition-colors">
          <ArrowLeft size={20} className="text-muted" />
        </button>
        <div className="flex items-center gap-3">
          <img src={asset.iconUrl} alt={asset.ticker} className="w-8 h-8 rounded-full" />
          <div>
            <h2 className="font-semibold text-lg">{asset.name}</h2>
            <p className="text-xs text-muted">
              {asset.ticker} ({asset.network})
            </p>
          </div>
        </div>
      </div>

      <div className="flex border-b border-color bg-secondary">
        <button
          onClick={() => setActiveTab('send')}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            activeTab === 'send'
              ? 'border-b-2 border-brand-primary text-brand-primary'
              : 'text-muted hover:text-primary'
          }`}
        >
          Send
        </button>
        <button
          onClick={() => setActiveTab('receive')}
          className={`flex-1 py-3 text-sm font-medium transition-colors ${
            activeTab === 'receive'
              ? 'border-b-2 border-brand-primary text-brand-primary'
              : 'text-muted hover:text-primary'
          }`}
        >
          Receive
        </button>
      </div>

      <div className="p-2 pt-6 flex-1 bg-secondary">
        {activeTab === 'send' ? (
          <div className="max-w-md mx-auto space-y-6">
            <div className="text-center mb-6">
              <p className="text-muted mb-1">Available Balance</p>
              <h3 className="text-3xl font-bold">
                {asset.quantity.toLocaleString()} {asset.ticker}
              </h3>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-muted uppercase mb-1 block">
                  Destination Address
                </label>
                <input
                  type="text"
                  value={destination}
                  onChange={e => setDestination(e.target.value)}
                  placeholder="G..."
                  className="input w-full font-mono text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-muted uppercase mb-1 block">
                  Amount
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="input w-full pr-16"
                  />
                  <button
                    onClick={handleMax}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold text-brand-primary px-2 py-1 hover:bg-brand-primary/10 rounded"
                  >
                    MAX
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-muted uppercase mb-1 block">
                  Memo (Optional)
                </label>
                <input
                  type="text"
                  value={memo}
                  onChange={e => setMemo(e.target.value)}
                  placeholder="Required by exchanges"
                  className="input w-full"
                />
              </div>

              <button
                onClick={handleSend}
                disabled={!destination || !amount || isSending}
                className="btn btn-primary w-full py-4 mt-4 flex items-center justify-center gap-2"
              >
                {isSending ? <span>Sending...</span> : <>Send {asset.ticker}</>}
              </button>
            </div>
          </div>
        ) : (
          <div className="max-w-md mx-auto flex flex-col items-center justify-center h-full space-y-8">
            <div className="text-center">
              <h3 className="text-xl font-semibold mb-2">Receive {asset.ticker}</h3>
              <p className="text-muted text-sm max-w-xs mx-auto">
                Scan this QR code or copy the address below to receive {asset.name}.
              </p>
            </div>

            <div className="bg-white p-4 rounded-xl shadow-lg">
              {qrCodeUrl ? (
                <img src={qrCodeUrl} alt="QR Code" className="w-48 h-48 block" />
              ) : (
                <div className="w-48 h-48 bg-gray-100 animate-pulse rounded" />
              )}
            </div>

            <div className="w-full">
              <label className="text-xs font-semibold text-muted uppercase mb-2 block text-center">
                Your Stellar Address
              </label>
              <div className="bg-tertiary p-3 rounded-lg flex items-center justify-between border border-color gap-2">
                <p className="font-mono text-sm truncate text-primary">{userAddress}</p>
                <button
                  onClick={handleCopy}
                  className="p-2 hover:bg-hover rounded-md transition-colors text-brand-primary shrink-0"
                >
                  {isCopied ? <Check size={18} /> : <Copy size={18} />}
                </button>
              </div>
            </div>

            <div className="bg-warning-bg p-4 rounded-lg flex gap-3 text-warning border border-warning/20">
              <CreditCard className="shrink-0 w-5 h-5" />
              <p className="text-xs leading-relaxed">
                Send only <strong>{asset.network}</strong> assets to this address. Sending other
                assets may result in permanent loss.
              </p>
            </div>
          </div>
        )}
      </div>

      <StellarTransactionModal
        isOpen={txModal.isOpen}
        onClose={() => {
          setTxModal(prev => ({ ...prev, isOpen: false }));
          if (txModal.status === 'success') onBack();
        }}
        status={txModal.status}
        type="Send"
        hash={txModal.hash}
        error={txModal.error}
      />
    </div>
  );
};

export default StellarSendReceive;
