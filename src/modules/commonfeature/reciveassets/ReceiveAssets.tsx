import { useCallback } from 'react';
import { Copy, Share2 } from 'lucide-react';
import QRCode from 'qrcode';

import PageLayout from '../../../components/layout/PageLayout';
import StellarActiveGuard from '../../walletconnect/components/StellarActiveGuard';
import { useWalletConnect } from '../../walletconnect/hooks/useWalletConnect';
import { useReceiveAssets } from '../hook/useReceiveassets';

interface QRCardProps {
  walletAddress: string;
  isAddressValid: boolean;
  currentAsset: { label: string; value: string; network: string; logo: string; walletType: string } | undefined;
  handleCopy: () => void;
  handleShare: () => void;
}

const truncateAddress = (address: string, chars = 10) => {
  if (!address) return '';
  if (address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
};

const QRCard = ({ walletAddress, isAddressValid, currentAsset, handleCopy, handleShare }: QRCardProps) => {
  const canInteract = !!walletAddress && isAddressValid;
  const canvasCallbackRef = useCallback(
    (canvas: HTMLCanvasElement | null) => {
      if (!canvas || !walletAddress || !isAddressValid) return;
      QRCode.toCanvas(
        canvas,
        walletAddress,
        { width: 200, margin: 2, color: { dark: '#000000', light: '#ffffff' } },
        err => { if (err) console.error('QR error:', err); }
      );
    },
    [walletAddress, isAddressValid]
  );

  return (
    <div className="card card-premium flex flex-col items-center p-6 gap-6 shadow-xl">
      {canInteract ? (
        <div className="relative w-56 h-56 bg-white rounded-3xl p-4 shadow-xl ring-1 ring-border animate-scale-in flex items-center justify-center">
          <canvas ref={canvasCallbackRef} className="w-full h-full rounded-2xl" />
          {currentAsset?.logo && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="bg-white rounded-full p-1.5 shadow-xl ring-2 ring-border overflow-hidden">
                <img
                  src={currentAsset.logo}
                  alt={currentAsset.label}
                  className="h-12 w-12 rounded-full object-cover"
                  onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                />
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="w-52 h-52 bg-bg-card rounded-2xl ring-1 ring-dashed ring-border flex flex-col items-center justify-center gap-3 animate-fade-in">
          {currentAsset?.logo && (
            <img
              src={currentAsset.logo}
              alt={currentAsset.label}
              className="h-10 w-10 rounded-full opacity-30"
              onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            />
          )}
          <p className="text-text-muted text-center text-xs px-6 leading-relaxed">
            {!walletAddress
              ? `Connect your ${currentAsset?.network ?? ''} wallet to see your address`
              : 'Invalid address for this network'}
          </p>
        </div>
      )}

      <div className="w-full">
        <p className="text-xs font-semibold text-text-secondary text-center mb-2">
          Your {currentAsset?.value} Address
        </p>
        <div
          className={[
            'relative card card-glass rounded-xl py-3.5 px-4 pr-12 text-center text-sm font-mono leading-relaxed transition-all',
            isAddressValid
              ? 'border-border text-text-primary hover:border-primary'
              : 'border-danger text-danger-dark bg-danger-light',
          ].join(' ')}
        >
          {walletAddress ? truncateAddress(walletAddress) : `No ${currentAsset?.network ?? ''} address available`}
          <button
            onClick={handleCopy}
            disabled={!canInteract}
            aria-label="Copy wallet address"
            className="btn btn-ghost absolute right-2 top-1/2 -translate-y-1/2 p-1.5 p-3 rounded-md hover:bg-bg-overlay transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Copy className="w-4 h-4 text-text-muted" />
          </button>
        </div>
      </div>

      <div className="flex w-full gap-2">
        <button
          onClick={handleCopy}
          disabled={!canInteract}
          className="btn btn-primary flex-1 flex items-center justify-center gap-1 py-4 rounded-md text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          <Copy className="w-4 h-4" />
          Copy Address
        </button>
        <button
          onClick={handleShare}
          disabled={!canInteract}
          className="btn btn-ghost flex-1 flex items-center justify-center gap-2 py-4 rounded-md text-sm font-semibold ring-1 ring-border disabled:opacity-40 disabled:cursor-not-allowed transition-all hover:bg-bg-overlay"
        >
          <Share2 className="w-4 h-4" />
          Share
        </button>
      </div>
    </div>
  );
};

const ReceiveAssets = ({ onClose }: { onClose?: () => void }) => {
  const {
    assets,
    selectedAssetValue,
    setSelectedAssetValue,
    currentAsset,
    walletAddress,
    isAddressValid,
    isConnected,
    isWalletTypeConnected,
    handleCopy,
    handleShare,
    copyFeedback,
  } = useReceiveAssets();

  const { openModal } = useWalletConnect();

  const qrCardProps = { walletAddress, isAddressValid, currentAsset, handleCopy, handleShare };

  return (
    <PageLayout
      title="Receive Crypto"
      subtitle={`Receive ${currentAsset?.label || 'cryptocurrency'}.`}
      onBack={onClose}
      showBackButton={!!onClose}
      maxWidth="lg"
      hasFooter={false}
    >
      <div className="space-y-6">


        {copyFeedback && (
          <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg animate-fade-in">
            {copyFeedback}
          </div>
        )}


        {!isConnected && (
          <div className="bg-warning-light border-warning p-4 text-sm text-warning-dark animate-fade-in rounded-lg border">
            <p className="font-semibold">Wallet Not Connected</p>
            <p className="mb-3">Please connect your wallet to view your receiving addresses.</p>
            <button
              onClick={openModal}
              className="btn btn-primary px-4 py-2 rounded-lg text-sm font-medium"
            >
              Connect Wallet
            </button>
          </div>
        )}

        {isConnected && (
          <>
            <div className="card p-4">
              <label htmlFor="asset" className="block text-sm font-semibold text-text-primary mb-2">
                Select Cryptocurrency
              </label>
              <div className="relative">
                <select
                  id="asset"
                  className="input input-primary w-full rounded-lg text-base cursor-pointer appearance-none pr-12"
                  value={selectedAssetValue}
                  onChange={e => setSelectedAssetValue(e.target.value)}
                >
                  {assets.map(assetOption => (
                    <option key={assetOption.value} value={assetOption.value}>
                      {assetOption.label}
                    </option>
                  ))}
                </select>
                {currentAsset && (
                  <div className="absolute right-12 top-1/2 -translate-y-1/2 pointer-events-none">
                    <img
                      src={currentAsset.logo}
                      alt={`${currentAsset.label} logo`}
                      className="h-8 w-8 rounded-full"
                      onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                    />
                  </div>
                )}
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-text-muted">
                  <svg className="fill-current h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                    <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                  </svg>
                </div>
              </div>
            </div>
            {!isWalletTypeConnected && (
              <div className="card card-bordered bg-warning-light border-warning p-4 text-sm text-warning-dark animate-fade-in">
                <p className="font-semibold">Wallet Type Not Connected</p>
                <p className="mb-3">
                  Please connect a {currentAsset?.network} wallet to receive {currentAsset?.value}.
                </p>
                <button
                  onClick={openModal}
                  className="btn btn-primary px-4 py-2 rounded-lg text-sm font-medium"
                >
                  Connect {currentAsset?.network} Wallet
                </button>
              </div>
            )}
            {isWalletTypeConnected && walletAddress && !isAddressValid && (
              <div className="card card-bordered bg-danger-light border-danger p-4 text-sm text-danger-dark animate-fade-in">
                <p className="font-semibold">Invalid Address</p>
                <p>
                  No valid {currentAsset?.network} address found. Please ensure the wallet supports{' '}
                  {currentAsset?.network}.
                </p>
              </div>
            )}

            {currentAsset?.walletType === 'stellar' ? (
              <StellarActiveGuard>
                <QRCard {...qrCardProps} />
              </StellarActiveGuard>
            ) : (
              <QRCard {...qrCardProps} />
            )}
          </>
        )}
      </div>
    </PageLayout>
  );
};

export default ReceiveAssets;