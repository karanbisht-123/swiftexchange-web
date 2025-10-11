import { ChevronDown, Wallet } from 'lucide-react';
import React, { useState } from 'react';

import { WalletType } from '../constants/Wallet';
import { useWalletConnect } from '../hooks/useWalletConnect';

export const ConnectWalletButton: React.FC = () => {
  const { connectedWallets, openModal, disconnectType } = useWalletConnect();
  const [showDropdown, setShowDropdown] = useState(false);

  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const disconnectAll = () => {
    Object.keys(connectedWallets).forEach(type => {
      disconnectType(type as WalletType);
    });
    setShowDropdown(false);
  };

  const handleDisconnect = (type: WalletType) => {
    disconnectType(type);
    if (Object.keys(connectedWallets).length === 1) {
      setShowDropdown(false);
    }
  };

  const getTypeLabel = (type: string) => {
    return type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
  };

  const hasConnections = Object.keys(connectedWallets).length > 0;
  const connectionCount = Object.keys(connectedWallets).length;

  return (
    <div className="relative">
      {hasConnections ? (
        <div className="flex items-center gap-2">
          {/* Connected Wallets Display - Desktop */}
          <div className="hidden lg:flex items-center gap-2">
            {Object.entries(connectedWallets)
              .slice(0, 2)
              .map(([type, conn]) => (
                <div
                  key={type}
                  className="flex items-center gap-2 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg"
                >
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <div className="flex flex-col">
                    <span className="text-xs text-gray-400">{getTypeLabel(type)}</span>
                    <span className="text-sm text-gray-200 font-medium">
                      {formatAddress(conn.address)}
                    </span>
                  </div>
                </div>
              ))}
            {connectionCount > 2 && (
              <div className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-300">
                +{connectionCount - 2} more
              </div>
            )}
          </div>

          {/* Connected Badge - Mobile/Tablet */}
          <div className="flex lg:hidden items-center gap-2 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-sm text-gray-200 font-medium">{connectionCount} Connected</span>
          </div>

          {/* Dropdown Button */}
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors shadow-lg"
          >
            <Wallet className="w-4 h-4" />
            <span className="hidden sm:inline">Manage</span>
            <ChevronDown
              className={`w-4 h-4 transition-transform ${showDropdown ? 'rotate-180' : ''}`}
            />
          </button>

          {/* Dropdown Menu */}
          {showDropdown && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowDropdown(false)}></div>
              <div className="absolute -right-20 lg:right-0 lg:left-0 top-full mt-2 w-72 md:w-80 bg-gray-900 border border-gray-800 rounded-xl shadow-2xl z-50 overflow-hidden">
                <div className="p-3 border-b border-gray-800 bg-gray-800/50">
                  <h3 className="text-sm font-semibold text-gray-200">Connected Wallets</h3>
                </div>

                <div className="max-h-64 overflow-y-auto">
                  {Object.entries(connectedWallets).map(([type, conn]) => (
                    <div
                      key={type}
                      className="flex items-center justify-between p-3 hover:bg-gray-800/50 transition-colors border-b border-gray-800/50 last:border-b-0"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-2 h-2 bg-green-500 rounded-full flex-shrink-0"></div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs text-gray-400">{getTypeLabel(type)}</span>
                          <span className="text-sm text-gray-200 font-medium truncate">
                            {formatAddress(conn.address)}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDisconnect(type as WalletType)}
                        className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-xs font-medium transition-colors flex-shrink-0"
                      >
                        Disconnect
                      </button>
                    </div>
                  ))}
                </div>

                <div className="p-3 border-t border-gray-800 bg-gray-800/30 flex gap-2">
                  <button
                    onClick={() => {
                      openModal();
                      setShowDropdown(false);
                    }}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    {/* <Plus className="w-4 h-4" /> */}
                    Add Wallet
                  </button>
                  <button
                    onClick={disconnectAll}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-sm font-medium transition-colors"
                  >
                    {/* <LogOut className="w-4 h-4" /> */}
                    Disconnect All
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      ) : (
        <button
          onClick={openModal}
          className="flex items-center gap-2 px-4 md:px-6 py-2.5 md:py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-all shadow-lg hover:shadow-xl hover:scale-105"
        >
          <Wallet className="w-4 md:w-5 h-4 md:h-5" />
          <span className="text-sm md:text-base">Connect Wallet</span>
        </button>
      )}
    </div>
  );
};
