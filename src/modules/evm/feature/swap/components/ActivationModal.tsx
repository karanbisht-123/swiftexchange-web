import { AlertCircle, CheckCircle, Loader2, X } from 'lucide-react';
import React, { useEffect } from 'react';

import { Horizon } from '@stellar/stellar-sdk';
import { ethers } from 'ethers';

import { AmmSwapService } from '../../../../../modules/stellar/service/ammSwapService';
import {
  buildTrustlineTransaction,
  signAndSubmitTrustline,
} from '../../../../../modules/stellar/utils/assetUtils/assetUtils';
import { getStellarConfig } from '../../../../../modules/walletconnect/config/chains';
import { WalletType } from '../../../../../modules/walletconnect/constants/Wallet';
import { useStellarAccountStatus } from '../../../../../modules/walletconnect/hooks/useStellarAccountStatus';
import { useWalletConnect } from '../../../../../modules/walletconnect/hooks/useWalletConnect';
import { useWalletStore } from '../../../../../modules/walletconnect/store/walletConnectStore';
import { useActivationStore } from '../../../../../store/activationStore';
import { useNotificationStore } from '../../../../../store/notificationStore';
import { pollNearIntentStatus } from '../services/oneClickApi';

export const ActivationModal: React.FC = () => {
  const {
    pendingActivation,
    isMinimized,
    setMinimized,
    updateStatus,
    updateIntentStatus,
    clearActivation,
    setPendingActivation,
  } = useActivationStore();
  const { checkStatus } = useStellarAccountStatus();
  const { getProvider } = useWalletConnect();
  const { showToast } = useNotificationStore();

  const currentNetwork = useWalletStore((state: any) => state.network);
  const stellarAddress = useWalletStore(
    (state: any) => state.connectedWallets[WalletType.STELLAR]?.address
  );

  const [timeEstimate, setTimeEstimate] = React.useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = React.useState<number>(0);
  const [refundInfo, setRefundInfo] = React.useState<{ fee?: string; deadline?: string } | null>(
    null
  );
  const [isCreatingTrustline, setIsCreatingTrustline] = React.useState(false);

  const intentStatus = pendingActivation?.lastIntentStatus || 'PENDING_DEPOSIT';
  const pollFailCount = pendingActivation?.pollFailCount || 0;

  // Track elapsed time
  useEffect(() => {
    if (pendingActivation?.status === 'pending_bridge' && pendingActivation.startedAt) {
      const timer = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - pendingActivation.startedAt) / 1000));
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [pendingActivation]);

  // Auto-maximize if status changes from pending
  useEffect(() => {
    if (pendingActivation && pendingActivation.status !== 'pending_bridge' && isMinimized) {
      setMinimized(false);
    }
  }, [pendingActivation?.status, isMinimized, setMinimized]);

  // Poll for bridge completion
  useEffect(() => {
    if (!pendingActivation) return;

    let interval: NodeJS.Timeout;

    if (pendingActivation.status === 'pending_bridge') {
      interval = setInterval(async () => {
        try {
          // Check EVM transaction receipt first
          if (pendingActivation.quoteHash.startsWith('0x')) {
            const evmProvider = getProvider(WalletType.EVM);
            if (evmProvider) {
              const provider = new ethers.BrowserProvider(evmProvider);
              const receipt = await provider.getTransactionReceipt(pendingActivation.quoteHash);
              if (receipt && receipt.status === 0) {
                console.error('Activation EVM transaction reverted.');
                updateStatus('failed');
                return;
              }
            }
          }

          const res = await pollNearIntentStatus(
            pendingActivation.quoteHash,
            pendingActivation.depositAddress
          );
          if (res) {
            const newStatus = res.status || intentStatus;
            if (res.quoteResponse?.quote?.timeEstimate)
              setTimeEstimate(res.quoteResponse.quote.timeEstimate);

            if (res.quoteResponse?.quote) {
              setRefundInfo({
                fee: res.quoteResponse.quote.refundFee,
                deadline: res.quoteResponse.quote.deadline,
              });
            }

            updateIntentStatus(newStatus, 0);

            const upperStatus = newStatus.toUpperCase();
            const depositWindowPassed =
              res.quoteResponse?.quoteRequest?.deadline &&
              new Date() > new Date(res.quoteResponse.quoteRequest.deadline);
            const noDestTx = !res.swapDetails?.destinationChainTxHashes?.length;
            const isExpired = depositWindowPassed && noDestTx && upperStatus === 'PROCESSING';

            if (upperStatus === 'COMPLETED' || upperStatus === 'SUCCESS') {
              const isActive = await checkStatus(true);
              if (isActive) {
                try {
                  const stellarConfig = getStellarConfig(currentNetwork);
                  const server = new Horizon.Server(stellarConfig.horizonUrl);
                  const account = await server.loadAccount(stellarAddress);
                  const hasTrustline = account.balances.some(
                    (b: any) =>
                      b.asset_code === 'USDC' &&
                      b.asset_issuer === 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN'
                  );

                  if (hasTrustline) {
                    updateStatus('completed');
                  } else {
                    updateStatus('activated');
                  }
                } catch {
                  updateStatus('activated');
                }
              }
            } else if (upperStatus === 'FAILED' || upperStatus === 'REFUNDED' || isExpired) {
              updateStatus('failed');
            }
          }
        } catch (e) {
          updateIntentStatus(intentStatus, (pendingActivation.pollFailCount || 0) + 1);
          console.warn('Polling error:', e);
        }
      }, 10000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [
    pendingActivation?.status,
    pendingActivation?.quoteHash,
    pendingActivation?.depositAddress,
    checkStatus,
    updateStatus,
  ]);

  if (!pendingActivation) {
    return null;
  }

  const handleCreateTrustline = async () => {
    if (!stellarAddress) return;

    setIsCreatingTrustline(true);
    try {
      const stellarConfig = getStellarConfig(currentNetwork);
      const server = new Horizon.Server(stellarConfig.horizonUrl);
      const stellarProvider = getProvider(WalletType.STELLAR);

      const xdr = await buildTrustlineTransaction({
        server,
        stellarAddress,
        assetCode: 'USDC',
        assetIssuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
        currentNetwork,
      });

      const networkPassphrase = stellarConfig.networkPassphrase || '';
      const trustlineResult = await signAndSubmitTrustline(
        xdr,
        stellarConfig.network === 'PUBLIC' ? 'mainnet' : 'testnet',
        networkPassphrase,
        stellarProvider
      );

      if (!trustlineResult.success) {
        throw new Error(trustlineResult.error || 'Failed to set up trustline.');
      }

      showToast({
        type: 'STELLAR',
        title: 'Trustline Added',
        message: `Trustline created for USDC.`,
      });

      clearActivation();
    } catch (e: any) {
      console.error(e);
      const errorMsg = e.message?.toLowerCase() || '';
      const isUserReject = errorMsg.includes('cancel') || errorMsg.includes('reject');

      showToast({
        type: 'STELLAR',
        title: isUserReject ? 'Transaction Rejected' : 'Trustline Failed',
        message: isUserReject
          ? 'You cancelled the trustline transaction.'
          : e.message || 'Failed to create trustline.',
        dontSave: true,
      });

      try {
        AmmSwapService.clearAccountCache();
      } catch (e) {
        console.error(e);
      }
      window.dispatchEvent(new Event('stellar-trustline-added'));

      // Close the modal on any error, as requested
      clearActivation();
    } finally {
      setIsCreatingTrustline(false);
    }
  };

  const isComplete = pendingActivation.status === 'completed';

  return (
    <>
      <button
        onClick={() =>
          setPendingActivation({
            quoteHash: 'debug_hash',
            depositAddress: 'debug_address',
            originalDestAsset: { symbol: 'XLM', address: 'native' },
            status: 'activated',
            startedAt: Date.now(),
            lastIntentStatus: 'SUCCESS',
          })
        }
        className="fixed top-24 left-4 z-[99999] bg-red-500 text-white px-4 py-2 rounded font-bold"
      >
        DEBUG: SHOW TRUSTLINE UI
      </button>

      {isMinimized ? (
        <div
          onClick={() => setMinimized(false)}
          className="fixed bottom-6 right-6 z-[10000] flex items-center gap-3 px-4 py-3 rounded-full bg-brand-primary text-white font-medium cursor-pointer shadow-xl hover:bg-brand-secondary transition-all"
        >
          <Loader2 size={16} className="animate-spin" />
          <span>Activation in Progress...</span>
        </div>
      ) : (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-2xl bg-primary border border-color p-6 shadow-xl relative overflow-hidden">
            <button
              onClick={() => {
                if (isComplete || pendingActivation.status === 'failed') {
                  clearActivation();
                } else {
                  setMinimized(true);
                }
              }}
              className="absolute top-4 right-4 p-1.5 text-muted hover:text-white hover:bg-tertiary rounded-lg transition-colors z-10"
              title={isComplete || pendingActivation.status === 'failed' ? 'Close' : 'Minimize'}
            >
              <X size={18} />
            </button>

            <div className="text-center">
              {pendingActivation.status === 'pending_bridge' && (
                <>
                  <div className="relative w-16 h-16 mx-auto mb-4">
                    <Loader2 size={64} className="animate-spin text-brand-primary/20" />
                    <Loader2
                      size={64}
                      className="animate-spin text-brand-primary absolute inset-0 [animation-direction:reverse]"
                      style={{ animationDuration: '3s' }}
                    />
                  </div>
                  <h3 className="text-lg font-bold text-white mb-2">Activating Wallet</h3>
                  <p className="text-sm text-muted mb-4">
                    {intentStatus.toUpperCase() === 'PROCESSING'
                      ? 'Your transaction is being processed on the network...'
                      : 'Your deposit is being bridged. Please wait while the XLM is sent...'}
                  </p>

                  {pollFailCount >= 3 && (
                    <div className="w-full bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 mb-3 text-left">
                      <p className="text-xs text-yellow-300">
                        Network is slow to respond. Your funds are safe — check your transaction
                        history for live status.
                      </p>
                    </div>
                  )}

                  <div className="w-full bg-tertiary rounded-lg p-3 mb-3 flex items-center justify-between text-xs font-medium">
                    <span className="text-muted">Status</span>
                    <span className="text-white capitalize">
                      {intentStatus.toLowerCase().replace('_', ' ')}
                    </span>
                  </div>

                  {timeEstimate && (
                    <div className="w-full text-left">
                      <div className="flex justify-between text-xs mb-1.5">
                        <span className="text-muted">Estimated Time</span>
                        <span className="text-brand-primary font-medium">
                          {Math.max(0, timeEstimate - elapsedTime)}s
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-brand-primary transition-all duration-1000 ease-linear"
                          style={{ width: `${Math.min(100, (elapsedTime / timeEstimate) * 100)}%` }}
                        />
                      </div>
                    </div>
                  )}
                </>
              )}

              {pendingActivation.status === 'failed' && (
                <>
                  <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
                    <AlertCircle size={32} className="text-red-500" />
                  </div>
                  <h3 className="text-lg font-bold text-white mb-2">Activation Failed</h3>
                  <p className="text-sm text-muted mb-4">
                    The cross-chain deposit failed or expired.
                  </p>

                  {refundInfo && (
                    <div className="w-full bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-6 text-left">
                      <p className="text-xs text-red-200 mb-2 font-medium">
                        Your funds will be automatically refunded to your original wallet address on
                        the source chain.
                      </p>
                      <div className="flex justify-between text-xs text-red-300">
                        <span>Deadline Expired</span>
                        <span>
                          {refundInfo.deadline
                            ? new Date(refundInfo.deadline).toLocaleTimeString()
                            : 'Yes'}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs text-red-300 mt-1">
                        <span>Refund Type</span>
                        <span>Automatic</span>
                      </div>
                    </div>
                  )}

                  <button
                    onClick={clearActivation}
                    className="w-full py-3 bg-tertiary hover:bg-hover rounded-xl text-white font-medium transition-colors"
                  >
                    Close
                  </button>
                </>
              )}

              {pendingActivation.status === 'activated' && (
                <>
                  <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
                    <CheckCircle size={32} className="text-green-500" />
                  </div>
                  <h3 className="text-lg font-bold text-white mb-2">Wallet Activated!</h3>
                  <p className="text-sm text-muted mb-6">
                    Your wallet has been funded and is now active. Since USDC is the most traded
                    asset on Stellar, would you like to set up a USDC trustline now?
                  </p>
                  <div className="flex flex-col gap-3">
                    <button
                      onClick={handleCreateTrustline}
                      disabled={isCreatingTrustline}
                      className="w-full py-3 bg-brand-primary border-2 border-white/10 hover:bg-brand-secondary rounded-xl text-white font-bold transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isCreatingTrustline && <Loader2 size={16} className="animate-spin" />}
                      Make Trustline for USDC
                    </button>
                    <button
                      onClick={clearActivation}
                      disabled={isCreatingTrustline}
                      className="w-full py-3 bg-tertiary hover:bg-hover rounded-xl text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      I'll do it myself
                    </button>
                  </div>
                </>
              )}

              {isComplete && (
                <>
                  <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
                    <CheckCircle size={32} className="text-green-500" />
                  </div>
                  <h3 className="text-lg font-bold text-white mb-2">All Set!</h3>
                  <p className="text-sm text-muted mb-6">You are good to go bridge and swap!</p>
                  <button
                    onClick={clearActivation}
                    className="w-full py-3 bg-brand-primary hover:bg-brand-secondary rounded-xl text-white font-bold transition-colors"
                  >
                    Continue
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
