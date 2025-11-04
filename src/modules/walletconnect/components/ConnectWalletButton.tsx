import { ChevronDown, LogOut, Plus, Wallet } from 'lucide-react';
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
          {/* Desktop view - show wallet cards */}
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

          {/* Mobile compact view */}
          <div className="flex lg:hidden items-center gap-1.5 px-2.5 py-1.5 bg-gray-800 border border-gray-700 rounded-md">
            <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-sm text-gray-200 font-medium">{connectionCount}</span>
          </div>

          {/* Manage button */}
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="flex items-center gap-1.5 md:gap-2 px-2.5 md:px-4 py-1.5 md:py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md md:rounded-lg font-medium transition-colors shadow-lg text-xs md:text-sm"
          >
            <Wallet className="w-5 h-5 md:w-4 md:h-4" />
            <span className="hidden sm:inline">Manage</span>
            <ChevronDown
              className={`w-3.5 h-3.5 md:w-4 md:h-4 transition-transform ${showDropdown ? 'rotate-180' : ''}`}
            />
          </button>

          {/* Dropdown menu */}
          {showDropdown && (
            <>
              <div
                className="fixed inset-0 z-40 bg-black/20 md:bg-transparent"
                onClick={() => setShowDropdown(false)}
              ></div>

              {/* Mobile: Bottom sheet style */}
              <div className="fixed md:absolute left-0 right-0 bottom-0 md:bottom-auto md:left-auto md:-right-20 lg:right-0 lg:left-0 md:top-full md:mt-2 w-full md:w-80 bg-gray-900 md:border border-gray-800 md:rounded-xl shadow-2xl z-50 overflow-hidden animate-slide-up">
                {/* Mobile handle bar */}
                <div className="md:hidden pt-2 pb-1 flex justify-center bg-gray-900">
                  <div className="w-12 h-1 bg-gray-700 rounded-full"></div>
                </div>

                {/* Header */}
                <div className="p-4 md:p-3 border-b border-gray-800 bg-gray-900 md:bg-gray-800/50">
                  <h3 className="text-base md:text-sm font-semibold text-gray-200">
                    Connected Wallets
                  </h3>
                </div>

                {/* Wallet list */}
                <div className="max-h-[50vh] md:max-h-64 overflow-y-auto bg-gray-900">
                  {Object.entries(connectedWallets).map(([type, conn]) => (
                    <div
                      key={type}
                      className="flex items-center justify-between p-4 md:p-3 hover:bg-gray-800/50 active:bg-gray-800 transition-colors border-b border-gray-800/50 last:border-b-0"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-2.5 md:w-2 h-2.5 md:h-2 bg-green-500 rounded-full flex-shrink-0"></div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs text-gray-400 mb-0.5">{getTypeLabel(type)}</span>
                          <span className="text-sm text-gray-200 font-medium truncate">
                            {formatAddress(conn.address)}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDisconnect(type as WalletType)}
                        className="p-2 md:px-3 md:py-1.5 bg-red-500/10 hover:bg-red-500/20 active:bg-red-500/30 text-red-400 rounded-lg md:rounded-md transition-colors flex-shrink-0 flex items-center justify-center"
                        title="Disconnect"
                      >
                        <LogOut className="w-4 h-4 md:hidden" />
                        <span className="hidden md:inline text-xs font-medium">Disconnect</span>
                      </button>
                    </div>
                  ))}
                </div>

                {/* Footer actions */}
                <div className="p-4 md:p-3 border-t border-gray-800 bg-gray-900 md:bg-gray-800/30 flex gap-2 pb-safe">
                  <button
                    onClick={() => {
                      openModal();
                      setShowDropdown(false);
                    }}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-3 md:py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg md:rounded-md text-sm font-medium transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Wallet</span>
                  </button>
                  <button
                    onClick={disconnectAll}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-3 md:py-2 bg-red-500/10 hover:bg-red-500/20 active:bg-red-500/30 text-red-400 rounded-lg md:rounded-md text-sm font-medium transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
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
          <Wallet className="w-3.5 md:w-5 h-3.5 md:h-5" />
          <span>Connect Wallet</span>
        </button>
      )}
    </div>
  );
};
