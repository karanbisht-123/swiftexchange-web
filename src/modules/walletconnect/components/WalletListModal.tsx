import { X } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import {
  // COSMOS_WALLETS,
  EVM_WALLETS,
  STELLAR_WALLETS,
  type WalletConfig,
} from '../constants/Wallet';
import { useWalletStore } from '../store/walletConnectStore';

type WalletType = 'evm' | 'stellar';

export const WalletListModal: React.FC = () => {
  const {
    connectedWallets,
    isModalOpen,
    closeModal,
    connectWallet,
    disconnect,
    deriveDydx,
    // isConnecting,
    connectionStatus,
  } = useWalletStore();

  const [connectingWallet, setConnectingWallet] = useState<string | null>(null);
  const [disconnectingType, setDisconnectingType] = useState<WalletType | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connectTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (isModalOpen) {
      document.body.style.overflow = 'hidden';
      setError(null);
    } else {
      document.body.style.overflow = 'unset';
      setConnectingWallet(null);
      setError(null);
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isModalOpen]);

  useEffect(() => {
    return () => {
      if (connectTimeoutRef.current) {
        window.clearTimeout(connectTimeoutRef.current);
      }
    };
  }, []);

  const handleWalletClick = useCallback(
    async (wallet: WalletConfig) => {
      if (connectingWallet || disconnectingType) return;

      const walletKey = `${wallet.type}-${wallet.id}`;
      setConnectingWallet(walletKey);
      setError(null);

      connectTimeoutRef.current = window.setTimeout(() => {
        console.warn('[WalletModal] Timeout');
        setConnectingWallet(null);
        setError('Connection timeout. Please try again.');
      }, 125000);

      try {
        await connectWallet(wallet.type as WalletType, wallet.id);

        if (connectTimeoutRef.current) {
          window.clearTimeout(connectTimeoutRef.current);
        }
        setConnectingWallet(null);
      } catch (error: any) {
        console.error('[WalletModal] Connection failed:', error);

        if (connectTimeoutRef.current) {
          window.clearTimeout(connectTimeoutRef.current);
        }

        setConnectingWallet(null);
        const errorMessage = error?.message || 'Failed to connect. Please try again.';
        setError(errorMessage);

        setTimeout(() => {
          setError(null);
        }, 5000);
      }
    },
    [connectWallet, connectingWallet, disconnectingType]
  );

  const handleDisconnect = useCallback(
    async (type: WalletType) => {
      if (disconnectingType || connectingWallet) return;

      setDisconnectingType(type);
      setError(null);

      try {
        await disconnect(type);
        setDisconnectingType(null);
      } catch (error: any) {
        console.error('[WalletModal] Disconnect failed:', error);
        setDisconnectingType(null);

        const errorMessage = error?.message || 'Failed to disconnect. Please try again.';
        setError(errorMessage);

        setTimeout(() => {
          setError(null);
        }, 5000);
      }
    },
    [disconnect, disconnectingType, connectingWallet]
  );

  const handleDeriveDydx = useCallback(async () => {
    if (connectingWallet || disconnectingType) return;

    setError(null);

    try {
      await deriveDydx();
    } catch (error: any) {
      console.error('[WalletModal] Derivation failed:', error);

      if (error.message === 'Signature rejected by user') {
        setError('Signature rejected. You can try again anytime.');
      } else {
        const errorMessage = error?.message || 'Failed to derive wallet. Please try again.';
        setError(errorMessage);
      }

      setTimeout(() => {
        setError(null);
      }, 5000);
    }
  }, [deriveDydx, connectingWallet, disconnectingType]);

  const handleModalClose = useCallback(() => {
    if (disconnectingType) return;

    const isSigning = connectionStatus.evm?.state === 'signing';

    if (isSigning) {
      // Don't close while signing - let user complete or reject
      return;
    }

    if (connectingWallet) {
      setConnectingWallet(null);
      setError(null);
      if (connectTimeoutRef.current) {
        window.clearTimeout(connectTimeoutRef.current);
      }
    }

    closeModal();
  }, [closeModal, connectingWallet, disconnectingType, connectionStatus]);

  const getWalletConfig = useCallback((type: WalletType, id: string): WalletConfig | undefined => {
    // Only EVM and Stellar wallets (Cosmos commented out)
    const allWallets = [...EVM_WALLETS, /* ...COSMOS_WALLETS, */ ...STELLAR_WALLETS];
    return allWallets.find(w => w.type === type && w.id === id);
  }, []);

  const formatAddress = useCallback((addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  }, []);

  const renderConnected = useCallback(
    (type: WalletType) => {
      const connected = connectedWallets[type];
      if (!connected) return null;

      const config = getWalletConfig(type, connected.walletId);
      if (!config) return null;

      const isDisconnecting = disconnectingType === type;
      const hasDydx = type === 'evm' && connected.dydxAddress;
      const isSigning = type === 'evm' && connectionStatus.evm?.state === 'signing';

      return (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 p-4 rounded-xl border border-success/30 bg-success-bg">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-10 h-10 rounded-full bg-tertiary flex items-center justify-center flex-shrink-0">
                <img
                  src={config.icon}
                  alt={config.name}
                  className="w-6 h-6 rounded-full"
                  onError={e => {
                    e.currentTarget.style.display = 'none';
                    const parent = e.currentTarget.parentElement;
                    if (parent) {
                      parent.innerHTML = config.name[0];
                      parent.classList.add('text-muted', 'font-semibold');
                    }
                  }}
                />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-sm md:text-base font-medium text-primary truncate">
                  {config.name}
                </span>
                <span className="text-xs md:text-sm text-secondary truncate">
                  {formatAddress(connected.address)}
                </span>
              </div>
            </div>
            <button
              onClick={() => handleDisconnect(type)}
              disabled={isDisconnecting || connectingWallet !== null || isSigning}
              className="px-3 md:px-4 py-2 bg-danger hover:opacity-90 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 flex-shrink-0"
            >
              {isDisconnecting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span className="hidden sm:inline">Disconnecting...</span>
                </>
              ) : (
                'Disconnect'
              )}
            </button>
          </div>

          {type === 'evm' && (
            <div className="p-4 rounded-xl border border-brand/30 bg-brand/10">
              {hasDydx ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded-full bg-brand flex items-center justify-center">
                      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                    <span className="text-sm font-semibold text-brand">
                      dYdX Wallet Derived
                    </span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-brand/70">dYdX Address:</span>
                    <span className="text-xs md:text-sm text-brand font-mono break-all">
                      {connected.dydxAddress}
                    </span>
                  </div>
                </div>
              ) : isSigning ? (
                <div className="space-y-3">
                  <div className="flex items-start gap-2">
                    <div className="w-6 h-6 rounded-full bg-brand flex items-center justify-center flex-shrink-0 mt-0.5">
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-brand mb-1">
                        Sign Message in Wallet
                      </p>
                      <p className="text-xs text-brand/70">
                        Please sign the message in your wallet to generate your dYdX address. This
                        signature proves wallet ownership and is required for dYdX Chain access.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-start gap-2">
                    <div className="w-6 h-6 rounded-full bg-brand flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-white text-xs font-bold">dY</span>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-brand mb-1">
                        Derive dYdX Wallet
                      </p>
                      <p className="text-xs text-brand/70">
                        Generate your dYdX Chain address from your wallet. This requires a signature
                        to verify ownership.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleDeriveDydx}
                    disabled={connectingWallet !== null || disconnectingType !== null}
                    className="w-full px-4 py-2 bg-brand hover:opacity-90 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    Derive dYdX Wallet
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      );
    },
    [
      connectedWallets,
      getWalletConfig,
      formatAddress,
      handleDisconnect,
      handleDeriveDydx,
      disconnectingType,
      connectingWallet,
      connectionStatus,
    ]
  );

  const renderAvailableWallets = useCallback(() => {
    const isAnyActionInProgress = connectingWallet !== null || disconnectingType !== null;

    // Only show EVM wallets (Cosmos commented out)
    const allWallets = [...EVM_WALLETS /* ...COSMOS_WALLETS */];
    const stellarWallets = STELLAR_WALLETS;

    const hasEvm = connectedWallets.evm;
    const hasStellar = connectedWallets.stellar;

    return (
      <div className="space-y-6">
        {!hasEvm && (
          <div className="space-y-3">
            <h3 className="text-base md:text-lg font-semibold text-primary px-1">
              Connect Wallet
            </h3>
            <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
              {allWallets.map(wallet => {
                const walletKey = `${wallet.type}-${wallet.id}`;
                const isThisWalletConnecting = connectingWallet === walletKey;

                return (
                  <button
                    key={wallet.id}
                    onClick={() => handleWalletClick(wallet)}
                    disabled={isAnyActionInProgress}
                    className="flex flex-col items-center gap-3 p-4 rounded-xl border border-color hover:border-brand hover:bg-brand/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed group relative"
                  >
                    {isThisWalletConnecting && (
                      <div className="absolute inset-0 flex items-center justify-center bg-secondary/80 rounded-xl backdrop-blur-sm z-10">
                        <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin"></div>
                      </div>
                    )}
                    <div className="w-12 h-12 rounded-full bg-tertiary flex items-center justify-center flex-shrink-0 group-hover:bg-hover transition-colors">
                      <img
                        src={wallet.icon}
                        alt={wallet.name}
                        className="w-11 h-11 rounded-full"
                        onError={e => {
                          e.currentTarget.style.display = 'none';
                          const parent = e.currentTarget.parentElement;
                          if (parent) {
                            parent.innerHTML = wallet.name[0];
                            parent.classList.add('text-muted', 'font-bold', 'text-xl');
                          }
                        }}
                      />
                    </div>
                    <span className="text-xs md:text-sm font-medium text-primary text-center line-clamp-2">
                      {wallet.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {!hasStellar && (
          <div className="space-y-3">
            <h3 className="text-base md:text-lg font-semibold text-primary px-1">
              Stellar Wallets
            </h3>
            <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
              {stellarWallets.map(wallet => {
                const walletKey = `${wallet.type}-${wallet.id}`;
                const isThisWalletConnecting = connectingWallet === walletKey;

                return (
                  <button
                    key={wallet.id}
                    onClick={() => handleWalletClick(wallet)}
                    disabled={isAnyActionInProgress}
                    className="flex flex-col items-center gap-3 p-4 rounded-xl border border-color hover:border-brand hover:bg-brand/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed group relative"
                  >
                    {isThisWalletConnecting && (
                      <div className="absolute inset-0 flex items-center justify-center bg-secondary/80 rounded-xl backdrop-blur-sm z-10">
                        <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin"></div>
                      </div>
                    )}
                    <div className="w-12 h-12 rounded-full bg-tertiary flex items-center justify-center flex-shrink-0 group-hover:bg-hover transition-colors">
                      <img
                        src={wallet.icon}
                        alt={wallet.name}
                        className="w-11 h-11 rounded-full"
                        onError={e => {
                          e.currentTarget.style.display = 'none';
                          const parent = e.currentTarget.parentElement;
                          if (parent) {
                            parent.innerHTML = wallet.name[0];
                            parent.classList.add('text-muted', 'font-bold', 'text-xl');
                          }
                        }}
                      />
                    </div>
                    <span className="text-xs md:text-sm font-medium text-primary text-center line-clamp-2">
                      {wallet.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }, [connectedWallets, handleWalletClick, connectingWallet, disconnectingType]);

  if (!isModalOpen) return null;

  const modalClasses = isMobile
    ? 'fixed inset-x-0 bottom-0 z-50 bg-secondary rounded-t-3xl shadow-2xl max-h-[85vh] flex flex-col'
    : 'relative w-full max-w-2xl bg-secondary rounded-2xl shadow-2xl max-h-[90vh] flex flex-col';

  const isAnyActionInProgress = connectingWallet !== null || disconnectingType !== null;
  const isSigning = connectionStatus.evm?.state === 'signing';

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
          @keyframes slideUp {
            from { transform: translateY(100%); }
            to { transform: translateY(0); }
          }
          .modal-slide-up { animation: slideUp 0.3s ease-out; }
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          .fade-in { animation: fadeIn 0.2s ease-out; }
        `,
        }}
      />

      <div
        className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/70 backdrop-blur-sm fade-in"
        onClick={handleModalClose}
      >
        <div
          className={`${modalClasses} ${isMobile ? 'modal-slide-up' : ''}`}
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between p-4 md:p-6 border-b border-color flex-shrink-0">
            {isMobile && (
              <div className="absolute top-2 left-1/2 transform -translate-x-1/2 w-12 h-1 bg-tertiary rounded-full"></div>
            )}
            <h2 className="text-xl md:text-2xl font-bold text-primary mt-4 md:mt-0">
              Connect Wallet
            </h2>
            <button
              onClick={handleModalClose}
              className="p-2 text-muted hover:text-primary rounded-lg hover:bg-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isAnyActionInProgress || isSigning}
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {error && (
            <div className="mx-4 mt-4 p-3 bg-danger-bg border border-danger rounded-lg fade-in">
              <p className="text-sm text-danger text-center">{error}</p>
            </div>
          )}

          <div className="p-4 md:p-6 overflow-y-auto space-y-6 flex-1">
            {connectedWallets.evm && (
              <div className="space-y-3">
                <h3 className="text-base md:text-lg font-semibold text-primary px-1">
                  Connected Wallet
                </h3>
                {renderConnected('evm')}
              </div>
            )}

            {connectedWallets.stellar && (
              <div className="space-y-3">
                <h3 className="text-base md:text-lg font-semibold text-primary px-1">
                  Stellar Wallet
                </h3>
                {renderConnected('stellar')}
              </div>
            )}

            {renderAvailableWallets()}
          </div>

          {connectingWallet && !isSigning && (
            <div className="absolute inset-0 flex items-center justify-center bg-secondary/95 backdrop-blur-sm rounded-2xl z-20">
              <div className="text-center px-6">
                <div className="inline-block w-12 h-12 border-4 border-brand border-t-transparent rounded-full animate-spin mb-4"></div>
                <p className="text-primary font-medium text-lg mb-2">Connecting...</p>
                <p className="text-secondary text-sm">
                  {isMobile
                    ? 'Please approve the connection in your wallet app'
                    : 'Please scan the QR code or approve in your wallet'}
                </p>
                <button
                  onClick={handleModalClose}
                  className="mt-4 px-4 py-2 text-sm text-muted hover:text-primary transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};
