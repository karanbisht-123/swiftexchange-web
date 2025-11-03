import { Copy, Share2 } from 'lucide-react';

import PageLayout from '../../../components/layout/PageLayout';
import { useWalletConnect } from '../../walletconnect/hooks/useWalletConnect';
import { useReceiveAssets } from '../hook/useReceiveassets';

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
    qrCanvasRef,
  } = useReceiveAssets();

  const { openModal } = useWalletConnect();

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
                      onError={e => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  </div>
                )}
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-text-muted">
                  <svg
                    className="fill-current h-5 w-5"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                  >
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

            <div className="card card-premium flex flex-col items-center justify-center p-6">
              {walletAddress && isAddressValid ? (
                <div className="relative w-56 h-56 bg-bg-card p-4 rounded-lg border border-border mb-6 premium-shadow animate-scale-in">
                  <canvas ref={qrCanvasRef} className="w-full h-full rounded-md" />
                  {currentAsset && (
                    <img
                      src={currentAsset.logo}
                      alt={`${currentAsset.label} logo`}
                      className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-12 w-12 rounded-full bg-bg-card p-1 premium-shadow"
                    />
                  )}
                </div>
              ) : (
                <div className="w-56 h-56 bg-bg-card p-4 rounded-lg border border-dashed border-border mb-6 flex items-center justify-center animate-fade-in">
                  <p className="text-text-muted text-center text-sm">
                    {!walletAddress
                      ? `Connect ${currentAsset?.network} wallet to view address`
                      : 'Invalid address for selected network'}
                  </p>
                </div>
              )}

              <div className="w-full mb-4">
                <p className="text-sm font-semibold text-text-primary mb-2 text-center">
                  Your {currentAsset?.value} Address
                </p>
                <div
                  className={`relative card card-glass py-3 px-4 pr-12 text-center text-sm text-mono break-all ${
                    isAddressValid
                      ? 'border-border text-text-primary'
                      : 'border-danger text-danger-dark bg-danger-light'
                  }`}
                >
                  {walletAddress || `No ${currentAsset?.network} address available`}
                  <button
                    id="copy-btn-address"
                    onClick={() => handleCopy()}
                    className="btn btn-ghost absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-md hover:bg-bg-overlay transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label="Copy wallet address"
                    disabled={!walletAddress || !isAddressValid}
                  >
                    <Copy className="w-5 h-5 text-text-muted" />
                  </button>
                </div>
              </div>

              <div className="flex justify-center space-x-6">
                <button
                  onClick={() => handleCopy()}
                  className="btn btn-ghost flex flex-col items-center space-y-1 text-text-primary hover:text-text-accent transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  disabled={!walletAddress || !isAddressValid}
                >
                  <Copy className="w-6 h-6" />
                  <span className="font-medium">Copy Address</span>
                </button>
                <button
                  onClick={handleShare}
                  className="btn btn-ghost flex flex-col items-center space-y-1 text-text-primary hover:text-text-accent transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  disabled={!walletAddress || !isAddressValid}
                >
                  <Share2 className="w-6 h-6" />
                  <span className="font-medium">Share Address</span>
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </PageLayout>
  );
};

export default ReceiveAssets;
