import { useCallback, useMemo, useState } from 'react';
import { Copy, ChevronRight, QrCode, AlertCircle, Plus, Loader2 } from 'lucide-react';
import QRCode from 'qrcode';

import PageLayout from '../../../components/layout/PageLayout';
import StellarActiveGuard from '../../walletconnect/components/StellarActiveGuard';
import { useReceiveAssets } from '../hook/useReceiveassets';
import { useAssetSelectorModal } from '../components/useAssetSelectorModal';
import { getChainLogoUrl } from '../../evm/utils/Chainregistry';
import { EvmActionGuard } from '../../evm/components/EvmActionGuard';
import { ConfirmationModal } from '../../../components/common/ConfirmationModal';

interface QRCardProps {
  walletAddress: string;
  isAddressValid: boolean;
  currentAsset: any;
  handleCopy: () => void;
  handleShare: () => void;
  hasTrustline?: boolean | null;
  isAddingTrustline?: boolean;
  onAddTrustlineClick?: () => void;
}
const QRCard = ({ walletAddress, isAddressValid, currentAsset, handleCopy, handleShare, hasTrustline, isAddingTrustline, onAddTrustlineClick }: QRCardProps) => {
  const canInteract = !!walletAddress && isAddressValid;

  const canvasCallbackRef = useCallback(
    (canvas: HTMLCanvasElement | null) => {
      if (!canvas || !walletAddress || !isAddressValid) return;

      const size = 200;
      canvas.width = size;
      canvas.height = size;
      canvas.style.width = `${size}px`;
      canvas.style.height = `${size}px`;

      QRCode.toCanvas(
        canvas,
        walletAddress,
        {
          width: size,
          margin: 2,
          errorCorrectionLevel: 'H',
          color: { dark: '#000000', light: '#ffffff' },
        },
        err => { if (err) console.error('QR error:', err); }
      );
    },
    [walletAddress, isAddressValid]
  );

  return (
    <div className="bg-bg-tertiary rounded-2xl overflow-hidden">
      <div className="p-4 py-8 lg:p-8 flex flex-col items-center gap-8">
        {canInteract ? (
          <div className="relative group">
            <div className="bg-white rounded-xl p-4 shadow-xl ring-1 ring-black/5 transition-transform duration-500 group-hover:scale-[1.02]">
              <canvas ref={canvasCallbackRef} className="rounded-lg" />
            </div>
            {currentAsset?.image && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="bg-white rounded-full p-2 shadow-2xl ring-4 ring-white overflow-hidden">
                  <img
                    src={currentAsset.image}
                    alt=""
                    className="h-10 w-10 rounded-full object-contain"
                  />
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="w-52 h-52 bg-bg-tertiary rounded-xl border-2 border-dashed border-divider flex flex-col items-center justify-center gap-3">
            <QrCode size={40} className="text-text-muted opacity-20" />
            <p className="text-text-muted text-[10px] uppercase font-black tracking-widest px-8 text-center leading-tight">
              Waiting for Connection
            </p>
          </div>
        )}

        <div className="w-full space-y-4">
          <div className="text-center">
            <p className="text-[10px] font-black text-text-muted uppercase tracking-widest mb-2">
              Your {currentAsset?.symbol} Address
            </p>
            <div className="bg-bg-secondary rounded-xl p-4 relative group">
              <div className="text-xs font-mono text-text-primary whitespace-nowrap overflow-x-auto hide-scrollbar leading-relaxed pr-8 pb-1">
                {walletAddress || "Address not available"}
              </div>
              <button
                onClick={handleCopy}
                disabled={!canInteract}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-brand-primary transition-colors disabled:opacity-20"
              >
                <Copy size={16} />
              </button>
            </div>
            {!isAddressValid && walletAddress && (
              <p className="text-[10px] text-danger font-bold mt-2">Invalid {currentAsset?.network} Address</p>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            {hasTrustline === false ? (
              <button
                onClick={onAddTrustlineClick}
                disabled={!canInteract || isAddingTrustline}
                className="flex-1 btn-primary text-white py-4 rounded-xl text-sm font-black shadow-lg transition-all disabled:opacity-30 flex items-center justify-center gap-2"
              >
                {isAddingTrustline ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                Add Trustline
              </button>
            ) : (
              <button
                onClick={handleCopy}
                disabled={!canInteract}
                className="flex-1 btn-primary text-white py-4 rounded-xl text-sm font-black shadow-lg transition-all disabled:opacity-30 disabled:grayscale"
              >
                Copy Address
              </button>
            )}
            <button
              onClick={handleShare}
              disabled={!canInteract}
              className="flex-1 bg-bg-secondary text-text-primary py-4 rounded-xl text-sm font-black active:scale-[0.98] transition-all disabled:opacity-30"
            >
              Share Link
            </button>
          </div>
        </div>
      </div>

      <div className="bg-bg-secondary/30 p-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-warning/10 flex items-center justify-center">
            <AlertCircle size={14} className="text-warning" />
          </div>
          <p className="text-[10px] text-text-secondary leading-tight font-medium">
            Send only <span className="font-black text-text-primary">{currentAsset?.symbol}</span> via the <span className="font-black text-text-primary">{currentAsset?.network}</span> network to avoid permanent loss of funds.
          </p>
        </div>
      </div>
    </div>
  );
};

const ReceiveAssets = ({ onClose }: { onClose?: () => void }) => {
  const {
    currentAsset,
    walletAddress,
    isAddressValid,
    handleCopy,
    handleShare,
    copyFeedback,
    hasTrustline,
    isAddingTrustline,
    handleAddTrustline,
  } = useReceiveAssets();

  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);

  const { openAssetSelector } = useAssetSelectorModal();

  const currentChainLogo = useMemo(() => {
    if (!currentAsset) return null;
    const chainId = currentAsset.chainId;
    if (chainId === 'stellar' || chainId === 'pubnet') {
      return 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/stellar/info/logo.png';
    }
    return getChainLogoUrl(chainId as number);
  }, [currentAsset]);

  const qrCardProps = {
    walletAddress,
    isAddressValid,
    currentAsset,
    handleCopy,
    handleShare,
    hasTrustline,
    isAddingTrustline,
    onAddTrustlineClick: () => setIsConfirmModalOpen(true)
  };

  return (
    <PageLayout
      title="Receive Crypto"
      subtitle="Receive assets from any wallet or exchange"
      onBack={onClose}
      showBackButton={!!onClose}
      maxWidth="lg"
      hasFooter={false}
    >
      <div className=" mx-auto space-y-5">
        {copyFeedback && (
          <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-[100] bg-brand-primary text-white text-[11px] font-black uppercase px-6 py-2.5 rounded-full shadow-2xl animate-in fade-in slide-in-from-top-4 duration-300">
            {copyFeedback}
          </div>
        )}

        {currentAsset?.walletType === 'stellar' ? (
          <StellarActiveGuard onSkip={onClose}>
            <div className="space-y-5">
              <div className="space-y-2">
                <label className="block text-[11px] font-bold text-text-muted uppercase tracking-wider px-1">Receiving Asset</label>
                <button
                  onClick={() => openAssetSelector('RECEIVE')}
                  className="group relative w-full bg-bg-tertiary hover:bg-bg-hover rounded-2xl p-4 transition-all active:scale-[0.99] text-left"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="relative">
                        {currentAsset?.image ? (
                          <img src={currentAsset.image} alt="" className="w-12 h-12 rounded-full shadow-md border-2 border-bg-secondary" />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-bg-tertiary flex items-center justify-center text-sm font-bold text-text-secondary border border-divider">
                            {currentAsset?.symbol.slice(0, 2)}
                          </div>
                        )}
                        {currentChainLogo && (
                          <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-white flex items-center justify-center shadow-lg border border-divider overflow-hidden">
                            <img src={currentChainLogo} alt="" className="w-full h-full object-contain" />
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="font-black text-lg text-text-primary leading-none mb-1">{currentAsset?.symbol || "Select Asset"}</div>
                        <div className="text-[10px] text-brand-primary font-black uppercase tracking-widest bg-brand-primary/10 px-1.5 py-0.5 rounded-md inline-block">
                          {currentAsset?.network || "All"}
                        </div>
                      </div>
                    </div>
                    <ChevronRight size={18} className="text-text-muted group-hover:text-brand-primary transition-transform group-hover:translate-x-0.5" />
                  </div>
                </button>
              </div>

              <QRCard {...qrCardProps} />
            </div>
          </StellarActiveGuard>
        ) : (
          <EvmActionGuard>
            <div className="space-y-5">
              <div className="space-y-2">
                <label className="block text-[11px] font-bold text-text-muted uppercase tracking-wider px-1">Receiving Asset</label>
                <button
                  onClick={() => openAssetSelector('RECEIVE')}
                  className="group relative w-full bg-bg-tertiary hover:bg-bg-hover rounded-2xl p-4 transition-all active:scale-[0.99] text-left"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="relative">
                        {currentAsset?.image ? (
                          <img src={currentAsset.image} alt="" className="w-12 h-12 rounded-full shadow-md border-2 border-bg-secondary" />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-bg-tertiary flex items-center justify-center text-sm font-bold text-text-secondary border border-divider">
                            {currentAsset?.symbol.slice(0, 2)}
                          </div>
                        )}
                        {currentChainLogo && (
                          <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-white flex items-center justify-center shadow-lg border border-divider overflow-hidden">
                            <img src={currentChainLogo} alt="" className="w-full h-full object-contain" />
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="font-black text-lg text-text-primary leading-none mb-1">{currentAsset?.symbol || "Select Asset"}</div>
                        <div className="text-[10px] text-brand-primary font-black uppercase tracking-widest bg-brand-primary/10 px-1.5 py-0.5 rounded-md inline-block">
                          {currentAsset?.network || "All"}
                        </div>
                      </div>
                    </div>
                    <ChevronRight size={18} className="text-text-muted group-hover:text-brand-primary transition-transform group-hover:translate-x-0.5" />
                  </div>
                </button>
              </div>

              <QRCard {...qrCardProps} />
            </div>
          </EvmActionGuard>
        )}
      </div>

      <ConfirmationModal
        isOpen={isConfirmModalOpen}
        title="Add Trustline"
        message={
          <div className="space-y-2">
            <p>You are about to add a trustline for <span className="font-bold text-brand-primary">{currentAsset?.symbol}</span>. This will reserve 0.5 XLM in your account.</p>
            <p className="text-xs opacity-60">You'll need to sign a transaction in your wallet.</p>
          </div>
        }
        confirmText="Add Now"
        onConfirm={() => {
          handleAddTrustline();
          setIsConfirmModalOpen(false);
        }}
        onCancel={() => setIsConfirmModalOpen(false)}
      />
    </PageLayout>
  );
};

export default ReceiveAssets;

