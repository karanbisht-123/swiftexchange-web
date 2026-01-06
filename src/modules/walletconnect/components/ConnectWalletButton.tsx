import { useState } from 'react';

import { WalletType } from '../constants/Wallet';
import { useWalletConnect } from '../hooks/useWalletConnect';

export const ConnectWalletButton: React.FC = () => {
  const { connectedWallets, openModal, disconnect, disconnectAll } = useWalletConnect();

  // console.log(connectedWallets, 'Connected wallets state');

  const [showDropdown, setShowDropdown] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);

  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const copyToClipboard = async (address: string) => {
    await navigator.clipboard.writeText(address);
    setCopiedAddress(address);
    setTimeout(() => setCopiedAddress(null), 2000);
  };

  const handleDisconnectAll = async () => {
    await disconnectAll();
    setShowDropdown(false);
  };

  const handleDisconnect = async (type: WalletType) => {
    await disconnect(type);
    if (Object.keys(connectedWallets).length === 1) {
      setShowDropdown(false);
    }
  };

  const getTypeLabel = (type: string) => {
    if (!type || type === 'undefined') {
      return 'Unknown';
    }
    return type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
  };

  const validConnectedWallets = Object.entries(connectedWallets).filter(([type, conn]) => {
    return (
      type &&
      type !== 'undefined' &&
      conn &&
      conn.address &&
      Object.values(WalletType).includes(type as WalletType)
    );
  });

  const hasConnections = validConnectedWallets.length > 0;
  const connectionCount = validConnectedWallets.length;

  const renderAddresses = (conn: any, type: string) => (
    <div className="flex flex-col space-y-1">
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-xs text-gray-500">
            {type === 'evm' ? 'EVM' : type === 'cosmos' ? 'Cosmos' : 'Stellar'}
          </span>
          <span className="text-sm text-gray-200 font-medium">{formatAddress(conn.address)}</span>
        </div>
        <button
          onClick={() => copyToClipboard(conn.address)}
          className="text-xs text-blue-400 hover:text-blue-300 ml-2"
          title="Copy Address"
        >
          {copiedAddress === conn.address ? 'Copied!' : 'Copy'}
        </button>
      </div>
      {conn.dydxAddress && (
        <div className="flex items-center justify-between pl-2 border-l-2 border-green-500/30">
          <div className="flex flex-col">
            <span className="text-xs text-gray-500">dYdX Chain</span>
            <span className="text-xs text-green-400">{formatAddress(conn.dydxAddress)}</span>
          </div>
          <button
            onClick={() => copyToClipboard(conn.dydxAddress)}
            className="text-xs text-green-400 hover:text-green-300 ml-2"
            title="Copy dYdX Address"
          >
            {copiedAddress === conn.dydxAddress ? 'Copied!' : 'Copy'}
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="relative">
      {hasConnections ? (
        <div className="flex items-center gap-2">
          <div className="hidden lg:flex items-center gap-2">
            {validConnectedWallets.slice(0, 2).map(([type, conn]) => (
              <div
                key={type}
                className="flex items-center gap-2 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg min-w-0"
              >
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse shrink-0"></div>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-xs text-gray-400 truncate">{getTypeLabel(type)}</span>
                  {renderAddresses(conn, type)}
                </div>
              </div>
            ))}
            {connectionCount > 2 && (
              <div className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-300">
                +{connectionCount - 2} more
              </div>
            )}
          </div>
          <div className="flex lg:hidden items-center gap-1.5 px-2.5 py-1.5 bg-gray-800 border border-gray-700 rounded-md">
            <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-sm text-gray-200 font-medium">{connectionCount}</span>
          </div>
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="flex items-center gap-1.5 md:gap-2 px-2.5 md:px-4 py-1.5 md:py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md md:rounded-lg font-medium transition-colors shadow-lg text-xs md:text-sm"
          >
            Manage
            <span className={`transition-transform ${showDropdown ? 'rotate-180' : ''}`}>▼</span>
          </button>

          {/* Dropdown */}
          {showDropdown && (
            <>
              <div
                className="fixed inset-0 z-40 bg-black/20 md:bg-transparent"
                onClick={() => setShowDropdown(false)}
              ></div>

              <div className="fixed md:absolute left-0 right-0 bottom-0 md:bottom-auto md:left-auto md:-right-20 lg:right-0 lg:left-0 md:top-full md:mt-2 w-full md:w-96 bg-gray-900 md:border border-gray-800 md:rounded-xl shadow-2xl z-50 overflow-hidden animate-slide-up">
                <div className="md:hidden pt-2 pb-1 flex justify-center bg-gray-900">
                  <div className="w-12 h-1 bg-gray-700 rounded-full"></div>
                </div>
                <div className="p-4 md:p-3 border-b border-gray-800 bg-gray-900 md:bg-gray-800/50">
                  <h3 className="text-base md:text-sm font-semibold text-gray-200">
                    Connected Wallets ({connectionCount})
                  </h3>
                </div>
                <div className="max-h-[50vh] md:max-h-80 overflow-y-auto bg-gray-900">
                  {validConnectedWallets.map(([type, conn]) => (
                    <div
                      key={type}
                      className="flex items-start justify-between p-4 md:p-3 hover:bg-gray-800/50 active:bg-gray-800 transition-colors border-b border-gray-800/50 last:border-b-0"
                    >
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <div className="w-2.5 md:w-2 h-2.5 md:h-2 bg-green-500 rounded-full shrink-0 mt-1"></div>
                        <div className="flex flex-col min-w-0 flex-1 gap-2">
                          <span className="text-xs text-gray-400 mb-0.5">{getTypeLabel(type)}</span>
                          {renderAddresses(conn, type)}
                          <span className="text-xs text-gray-500 mt-1">{conn.walletId}</span>
                          {type === 'evm' && (
                            <div className="mt-1">
                              {conn.dydxAddress ? (
                                <span className="text-xs px-2 py-0.5 bg-green-500/10 text-green-400 rounded border border-green-500/20">
                                  dYdX Enabled
                                </span>
                              ) : (
                                <span className="text-xs px-2 py-0.5 bg-yellow-500/10 text-yellow-400 rounded border border-yellow-500/20">
                                  dYdX Not Derived
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => handleDisconnect(type as WalletType)}
                        className="p-2 md:px-3 md:py-1.5 bg-red-500/10 hover:bg-red-500/20 active:bg-red-500/30 text-red-400 rounded-lg md:rounded-md transition-colors flex-shrink-0 flex items-center justify-center"
                        title="Disconnect"
                      >
                        <span className="hidden md:inline text-xs font-medium">Disconnect</span>
                        <span className="md:hidden">×</span>
                      </button>
                    </div>
                  ))}
                </div>

                <div className="p-4 md:p-3 border-t border-gray-800 bg-gray-900 md:bg-gray-800/30 flex gap-2 pb-safe">
                  <button
                    onClick={() => {
                      openModal();
                      setShowDropdown(false);
                    }}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-3 md:py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg md:rounded-md text-sm font-medium transition-colors"
                  >
                    <span>Add Wallet</span>
                  </button>
                  <button
                    onClick={handleDisconnectAll}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-3 md:py-2 bg-red-500/10 hover:bg-red-500/20 active:bg-red-500/30 text-red-400 rounded-lg md:rounded-md text-sm font-medium transition-colors"
                  >
                    <span>Disconnect All</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      ) : (
        <button
          onClick={openModal}
          className="flex items-center gap-1.5 md:gap-2 px-3 md:px-6 py-2 md:py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-md md:rounded-lg font-medium transition-all shadow-lg hover:shadow-xl text-xs md:text-base"
        >
          <span>Connect Wallet</span>
        </button>
      )}
    </div>
  );
};
