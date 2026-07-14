import { AlertCircle, ArrowRight, ChevronLeft } from 'lucide-react';
import React from 'react';
import { useNavigate } from 'react-router-dom';

import { getChainLogoUrl } from '../../evm/utils/Chainregistry';
import { type Asset } from '../../walletconnect/store/portfolioStore';
import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import { type AssetInfoContext, buildSwapUrl } from '../utils/Depositassetutils';

const AssetIcon: React.FC<{ asset: Asset }> = ({ asset }) => {
  const chainIconUrl = asset.chainId
    ? (() => {
        try {
          return getChainLogoUrl(asset.chainId);
        } catch {
          return undefined;
        }
      })()
    : undefined;

  return (
    <div className="relative shrink-0">
      <img src={asset.image} alt={asset.symbol} className="w-12 h-12 rounded-full shadow-sm" />
      {chainIconUrl && (
        <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-background flex items-center justify-center overflow-hidden">
          <img
            src={chainIconUrl}
            alt=""
            className="w-full h-full object-cover rounded-full border-2 border-background"
          />
        </div>
      )}
    </div>
  );
};

interface AssetInfoStepProps {
  asset: Asset;
  context: AssetInfoContext;
  onBack: () => void;
  onClose: () => void;
  onPickDifferent: () => void;
}

export const AssetInfoStep: React.FC<AssetInfoStepProps> = ({
  asset,
  context,
  onBack,
  onClose,
  onPickDifferent,
}) => {
  const navigate = useNavigate();
  const isStellar = context === 'stellar';
  const evmWallet = useWalletStore(state => state.connectedWallets.evm);
  const evmChainId = (evmWallet?.chainId as number | string) ?? 137;

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex items-center gap-4 px-6 pt-6 pb-2 shrink-0">
        <button
          onClick={onBack}
          className="p-1 -ml-1 text-muted hover:text-primary transition-colors rounded-lg"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h3 className="text-lg font-bold text-primary tracking-tight">
          {isStellar ? 'Bridge Required' : 'Swap Required'}
        </h3>
      </div>

      <div className="overflow-y-auto flex-1 px-6 pb-6 pt-2 flex flex-col gap-6">
        <div className="flex items-center gap-4 px-1 py-2">
          <AssetIcon asset={asset} />
          <div className="flex flex-col">
            <div className="text-xl font-bold text-primary tracking-tight">{asset.symbol}</div>
            <div className="text-sm text-muted font-medium uppercase tracking-wider">
              {asset.chainName || asset.name}
            </div>
          </div>
        </div>
        {isStellar && (
          <>
            {/* Warning Box */}
            <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-[14px] text-amber-500/90 leading-relaxed font-medium">
                Stellar USDC requires a quick bridge to an EVM network before depositing. We'll
                guide you through it.
              </p>
            </div>

            {/* Unified Timeline Box (One single container) */}
            <div className="relative flex flex-col gap-8 p-5 rounded-xl border border-color bg-tertiary/20">
              {/* Subtle Timeline Line */}
              <div className="absolute left-[31px] top-8 bottom-8 w-[2px] bg-color rounded-full" />

              {/* Step 1 */}
              <div className="relative flex items-start gap-5">
                <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0 mt-0.5 z-10 ring-4 ring-background/50">
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-bold text-primary">Bridge to EVM</div>
                  <div className="text-[13px] text-muted mt-1 leading-relaxed">
                    Head to the swap page to securely route your assets.
                  </div>
                </div>
              </div>

              {/* Step 2 */}
              <div className="relative flex items-start gap-5 opacity-60">
                <div className="w-6 h-6 rounded-full bg-color/50 flex items-center justify-center shrink-0 mt-0.5 z-10 ring-4 ring-background/50">
                  <div className="w-2 h-2 rounded-full bg-background" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-bold text-primary">Deposit to dYdX</div>
                  <div className="text-[13px] text-muted mt-1 leading-relaxed">
                    Return here with your EVM USDC to finish up.
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 mt-auto pt-2">
              <button
                onClick={onPickDifferent}
                className="px-5 py-3.5 rounded-xl text-[14px] font-semibold text-muted hover:text-primary border border-color hover:bg-hover transition-colors whitespace-nowrap"
              >
                Change asset
              </button>
              <button
                onClick={() => {
                  localStorage.setItem('pending_dydx_intent', 'true');
                  navigate(buildSwapUrl(asset, evmChainId));
                  onClose();
                }}
                className="flex-1 py-3.5 btn btn-primary rounded-xl font-bold text-[14px] whitespace-nowrap"
              >
                Bridge Asset
              </button>
            </div>
          </>
        )}

        {!isStellar && (
          <>
            {/* Warning Box */}
            <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div className="text-[14px] text-amber-500/90 leading-relaxed font-medium">
                <span className="font-bold">USDC Required.</span> dYdX exclusively accepts USDC.
                Let's swap your <span className="font-bold">{asset.symbol}</span> first.
              </div>
            </div>

            {/* Unified Swap Layout Box */}
            <div className="flex items-center justify-between p-5 rounded-xl border border-color bg-tertiary/20">
              {/* From */}
              <div className="flex flex-col items-center gap-2">
                <img src={asset.image} alt={asset.symbol} className="w-10 h-10 rounded-full" />
                <span className="text-[13px] font-bold text-primary">{asset.symbol}</span>
              </div>

              {/* Arrow */}
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-color/30 text-muted">
                <ArrowRight className="w-4 h-4" />
              </div>

              {/* To */}
              <div className="flex flex-col items-center gap-2">
                <img
                  src="https://assets.coingecko.com/coins/images/6319/small/usdc.png"
                  alt="USDC"
                  className="w-10 h-10 rounded-full"
                />
                <span className="text-[13px] font-bold text-primary">USDC</span>
              </div>
            </div>

            <p className="text-[12px] text-muted text-center font-medium">
              After swapping, return here to complete your deposit.
            </p>

            <div className="flex gap-3 mt-auto pt-2">
              <button
                onClick={onPickDifferent}
                className="px-5 py-3.5 rounded-xl text-[14px] font-semibold text-muted border border-color hover:text-primary hover:bg-hover transition-colors whitespace-nowrap"
              >
                Change asset
              </button>
              <button
                onClick={() => {
                  localStorage.setItem('pending_dydx_intent', 'true');
                  navigate(buildSwapUrl(asset, evmChainId));
                  onClose();
                }}
                className="flex-1 py-3.5 btn btn-primary rounded-xl font-bold text-[14px] whitespace-nowrap"
              >
                Swap {asset.symbol}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
