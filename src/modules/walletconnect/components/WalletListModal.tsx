import { X } from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import {
  COSMOS_WALLETS,
  EVM_WALLETS,
  STELLAR_WALLETS,
  type WalletConfig,
  WalletType,
} from '../constants/Wallet';
import { useWalletConnect } from '../hooks/useWalletConnect';
import { walletService } from '../services/walletService';

export const WalletListModal: React.FC = () => {
  const { connectedWallets, isModalOpen, closeModal, connectWallet } = useWalletConnect();
  const [connectingWallet, setConnectingWallet] = useState<string | null>(null);
  const [disconnectingType, setDisconnectingType] = useState<WalletType | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connectTimeoutRef = useRef<number | null>(null);
  const disconnectTimeoutRef = useRef<number | null>(null);
  const connectionListenerRef = useRef<(() => void) | null>(null);

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
      if (disconnectTimeoutRef.current) {
        window.clearTimeout(disconnectTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (connectionListenerRef.current) {
      connectionListenerRef.current();
    }

    connectionListenerRef.current = walletService.onConnectionStateChange((type, state) => {
      console.log(`[WalletModal] Connection state changed: ${type} - ${state}`);

      if (state === 'connecting') {
      } else if (state === 'connected') {
        setConnectingWallet(null);
        if (connectTimeoutRef.current) {
          window.clearTimeout(connectTimeoutRef.current);
        }
      } else if (state === 'failed' || state === 'cancelled') {
        setConnectingWallet(null);
        if (connectTimeoutRef.current) {
          window.clearTimeout(connectTimeoutRef.current);
        }
      }
    });

    return () => {
      if (connectionListenerRef.current) {
        connectionListenerRef.current();
      }
    };
  }, []);

  const handleWalletClick = useCallback(
    async (wallet: WalletConfig) => {
      if (connectingWallet || disconnectingType) {
        return;
      }

      const walletKey = `${wallet.type}-${wallet.id}`;
      setConnectingWallet(walletKey);
      setError(null);

      connectTimeoutRef.current = window.setTimeout(() => {
        console.warn('[WalletModal] Connection timeout reached, clearing state');
        setConnectingWallet(null);
        setError('Connection timeout. Please try again.');
      }, 125000);

      try {
        await connectWallet(wallet.type, wallet.id);

        if (connectTimeoutRef.current) {
          window.clearTimeout(connectTimeoutRef.current);
        }

        setConnectingWallet(null);
      } catch (error: any) {
        console.error('[WalletModal] Failed to connect wallet:', error);
        if (connectTimeoutRef.current) {
          window.clearTimeout(connectTimeoutRef.current);
        }

        setConnectingWallet(null);
        const errorMessage = error?.message || 'Failed to connect wallet. Please try again.';
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
      if (disconnectingType || connectingWallet) {
        return;
      }

      setDisconnectingType(type);
      setError(null);
      disconnectTimeoutRef.current = window.setTimeout(() => {
        console.warn('[WalletModal] Disconnect timeout reached, clearing state');
        setDisconnectingType(null);
      }, 10000);

      try {
        // await disconnectType(type);
        // if (disconnectTimeoutRef.current) {
        //   window.clearTimeout(disconnectTimeoutRef.current);
        // }

        setDisconnectingType(null);
      } catch (error: any) {
        console.error('[WalletModal] Failed to disconnect wallet:', error);
        if (disconnectTimeoutRef.current) {
          window.clearTimeout(disconnectTimeoutRef.current);
        }

        setDisconnectingType(null);

        const errorMessage = error?.message || 'Failed to disconnect wallet. Please try again.';
        setError(errorMessage);

        setTimeout(() => {
          setError(null);
        }, 5000);
      }
    },
    [disconnectingType, connectingWallet]
  );

  const handleModalClose = useCallback(async () => {
    if (connectingWallet) {
      const [typeStr] = connectingWallet.split('-');
      // const type = typeStr as WalletType;

      console.log('[WalletModal] Cancelling connection due to modal close');

      // try {
      //   await walletService.cancelConnection(type);
      // } catch (err) {
      //   console.error('[WalletModal] Error cancelling connection:', err);
      // }

      setConnectingWallet(null);
      setError(null);

      if (connectTimeoutRef.current) {
        window.clearTimeout(connectTimeoutRef.current);
      }
    }

    // Don't allow closing while disconnecting
    if (disconnectingType) {
      return;
    }

    closeModal();
  }, [closeModal, connectingWallet, disconnectingType]);

  const getWalletConfig = useCallback((type: WalletType, id: string): WalletConfig | undefined => {
    const allWallets = [...EVM_WALLETS, ...COSMOS_WALLETS, ...STELLAR_WALLETS];
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

      return (
        <div className="flex items-center justify-between gap-3 p-4 rounded-xl border border-green-500/30 bg-green-500/10">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0">
              <img
                src={config.icon}
                alt={config.name}
                className="w-6 h-6 rounded-full"
                onError={e => {
                  e.currentTarget.style.display = 'none';
                  const parent = e.currentTarget.parentElement;
                  if (parent) {
                    parent.innerHTML = config.name[0];
                    parent.classList.add('text-gray-300', 'font-semibold');
                  }
                }}
              />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-sm md:text-base font-medium text-gray-100 truncate">
                {config.name}
              </span>
              <span className="text-xs md:text-sm text-gray-400 truncate">
                {formatAddress(connected.address)}
              </span>
            </div>
          </div>
          <button
            onClick={() => handleDisconnect(type)}
            disabled={isDisconnecting || connectingWallet !== null}
            className="px-3 md:px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 flex-shrink-0"
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
      );
    },
    [
      connectedWallets,
      getWalletConfig,
      formatAddress,
      handleDisconnect,
      disconnectingType,
      connectingWallet,
    ]
  );

  const renderWalletSection = useCallback(
    (wallets: WalletConfig[], title: string) => {
      const isAnyActionInProgress = connectingWallet !== null || disconnectingType !== null;

      return (
        <div className="space-y-3">
          <h3 className="text-base md:text-lg font-semibold text-gray-100 px-1">{title}</h3>
          <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
            {wallets.map(wallet => {
              const walletKey = `${wallet.type}-${wallet.id}`;
              const isThisWalletConnecting = connectingWallet === walletKey;

              return (
                <button
                  key={wallet.id}
                  onClick={() => handleWalletClick(wallet)}
                  disabled={isAnyActionInProgress}
                  className="flex flex-col items-center gap-3 p-4 rounded-xl border border-gray-700 hover:border-blue-500 hover:bg-blue-500/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed group relative"
                >
                  {isThisWalletConnecting && (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-900/80 rounded-xl backdrop-blur-sm z-10">
                      <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                  )}
                  <div className="w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center flex-shrink-0 group-hover:bg-gray-700 transition-colors">
                    <img
                      src={wallet.icon}
                      alt={wallet.name}
                      className="w-11 h-11 rounded-full"
                      onError={e => {
                        e.currentTarget.style.display = 'none';
                        const parent = e.currentTarget.parentElement;
                        if (parent) {
                          parent.innerHTML = wallet.name[0];
                          parent.classList.add('text-gray-300', 'font-bold', 'text-xl');
                        }
                      }}
                    />
                  </div>
                  <span className="text-xs md:text-sm font-medium text-gray-100 text-center line-clamp-2">
                    {wallet.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      );
    },
    [handleWalletClick, connectingWallet, disconnectingType]
  );

  const renderEvmSection = useCallback(() => {
    if (connectedWallets[WalletType.EVM]) {
      return (
        <div className="space-y-3">
          <h3 className="text-base md:text-lg font-semibold text-gray-100 px-1">EVM Wallets</h3>
          {renderConnected(WalletType.EVM)}
        </div>
      );
    }
    return renderWalletSection(EVM_WALLETS, 'EVM Wallets');
  }, [connectedWallets, renderConnected, renderWalletSection]);

  const renderCosmosSection = useCallback(() => {
    if (connectedWallets[WalletType.COSMOS]) {
      return (
        <div className="space-y-3">
          <h3 className="text-base md:text-lg font-semibold text-gray-100 px-1">Cosmos Wallets</h3>
          {renderConnected(WalletType.COSMOS)}
        </div>
      );
    }
    return renderWalletSection(COSMOS_WALLETS, 'Cosmos Wallets');
  }, [connectedWallets, renderConnected, renderWalletSection]);

  const renderStellarSection = useCallback(() => {
    if (connectedWallets[WalletType.STELLAR]) {
      return (
        <div className="space-y-3">
          <h3 className="text-base md:text-lg font-semibold text-gray-100 px-1">Stellar Wallets</h3>
          {renderConnected(WalletType.STELLAR)}
        </div>
      );
    }
    return renderWalletSection(STELLAR_WALLETS, 'Stellar Wallets');
  }, [connectedWallets, renderConnected, renderWalletSection]);

  if (!isModalOpen) return null;

  const modalClasses = isMobile
    ? 'fixed inset-x-0 bottom-0 z-50 bg-gray-900 rounded-t-3xl shadow-2xl max-h-[85vh] flex flex-col'
    : 'relative w-full max-w-2xl bg-gray-900 rounded-2xl shadow-2xl max-h-[90vh] flex flex-col';

  const isAnyActionInProgress = connectingWallet !== null || disconnectingType !== null;

  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: `
          @keyframes slideUp {
            from {
              transform: translateY(100%);
            }
            to {
              transform: translateY(0);
            }
          }

          .modal-slide-up {
            animation: slideUp 0.3s ease-out;
          }

          @keyframes fadeIn {
            from {
              opacity: 0;
            }
            to {
              opacity: 1;
            }
          }

          .fade-in {
            animation: fadeIn 0.2s ease-out;
          }
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
          <div className="flex items-center justify-between p-4 md:p-6 border-b border-gray-800 flex-shrink-0">
            {isMobile && (
              <div className="absolute top-2 left-1/2 transform -translate-x-1/2 w-12 h-1 bg-gray-700 rounded-full"></div>
            )}
            <h2 className="text-xl md:text-2xl font-bold text-gray-100 mt-4 md:mt-0">
              Connect Wallet
            </h2>
            <button
              onClick={handleModalClose}
              className="p-2 text-gray-400 hover:text-gray-200 rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isAnyActionInProgress}
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {error && (
            <div className="mx-4 mt-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg fade-in">
              <p className="text-sm text-red-200 text-center">{error}</p>
            </div>
          )}

          <div className="p-4 md:p-6 overflow-y-auto space-y-6 flex-1">
            {renderEvmSection()}
            {renderStellarSection()}
            {renderCosmosSection()}
          </div>

          {connectingWallet && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-900/95 backdrop-blur-sm rounded-2xl z-20">
              <div className="text-center px-6">
                <div className="inline-block w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                <p className="text-gray-200 font-medium text-lg mb-2">Connecting...</p>
                <p className="text-gray-400 text-sm">
                  {isMobile
                    ? 'Please approve the connection in your wallet app'
                    : 'Please scan the QR code with your wallet app'}
                </p>
                <button
                  onClick={handleModalClose}
                  className="mt-4 px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
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
