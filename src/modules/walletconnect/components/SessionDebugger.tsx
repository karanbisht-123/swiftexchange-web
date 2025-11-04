import React, { useEffect, useRef, useState } from 'react';

import { useTransactionRouter } from '../../transction/hook/useTransactionRouter';
import { transactionRouter } from '../../transction/router/transactionRouter';
import { WalletType } from '../constants/Wallet';
import { useWalletConnect } from '../hooks/useWalletConnect';

/**
 * Debug component to visualize wallet sessions and transaction router state
 * Add this to your app during development to see what's happening
 */
export const SessionDebugger: React.FC<{ show?: boolean }> = ({ show = true }) => {
  const { connectedWallets, getProvider } = useWalletConnect();
  const { getAllSessions, activeTransactionsCount } = useTransactionRouter();
  const [isExpanded, setIsExpanded] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const outerRef = useRef<HTMLDivElement>(null);

  // Auto-refresh every 2 seconds when expanded
  useEffect(() => {
    if (!isExpanded) return;

    const interval = setInterval(() => {
      setRefreshKey(prev => prev + 1);
    }, 2000);

    return () => clearInterval(interval);
  }, [isExpanded]);

  // Close on outside click
  useEffect(() => {
    if (!isExpanded) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (outerRef.current && !outerRef.current.contains(event.target as Node)) {
        setIsExpanded(false);
      }
    };

    document.addEventListener('click', handleClickOutside);

    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [isExpanded]);

  if (!show) return null;

  const sessions = getAllSessions();

  return (
    <div className="fixed bottom-4 right-4 z-50" ref={outerRef}>
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg shadow-lg font-medium text-sm flex items-center gap-2"
      >
        <span className="relative flex h-3 w-3">
          {activeTransactionsCount > 0 && (
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
          )}
          <span
            className={`relative inline-flex rounded-full h-3 w-3 ${
              sessions.size > 0 ? 'bg-green-500' : 'bg-red-500'
            }`}
          ></span>
        </span>
        Session Debugger {sessions.size > 0 && `(${sessions.size})`}
      </button>

      {isExpanded && (
        <div className="mt-2 bg-white rounded-lg shadow-2xl border-2 border-purple-200 w-96 max-h-[600px] overflow-hidden flex flex-col">
          <div className="bg-purple-600 text-white px-4 py-3 font-semibold flex items-center justify-between">
            <span>Wallet Sessions Debug</span>
            <button
              onClick={() => setRefreshKey(prev => prev + 1)}
              className="text-xs bg-purple-700 hover:bg-purple-800 px-2 py-1 rounded"
            >
              Refresh
            </button>
          </div>

          <div className="p-4 overflow-y-auto space-y-4">
            {/* Connected Wallets from Store */}
            <div>
              <h3 className="font-semibold text-sm text-gray-700 mb-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                Connected Wallets (Store)
              </h3>
              <div className="space-y-2">
                {Object.entries(connectedWallets).length === 0 ? (
                  <p className="text-xs text-gray-500 italic">No wallets connected</p>
                ) : (
                  Object.entries(connectedWallets).map(([type, wallet]) => {
                    if (!wallet) return null;
                    const provider = getProvider(type as WalletType);
                    return (
                      <div
                        key={type}
                        className="bg-blue-50 border border-blue-200 rounded p-2 text-xs"
                      >
                        <div className="font-semibold text-blue-900">{type}</div>
                        <div className="text-gray-600 font-mono text-[10px] break-all">
                          {wallet.address}
                        </div>
                        <div className="text-gray-500 mt-1">
                          Chain: {wallet.chainId} | Wallet: {wallet.walletId}
                        </div>
                        <div className={`mt-1 ${provider ? 'text-green-600' : 'text-red-600'}`}>
                          Provider: {provider ? '✓ Available' : '✗ Not Found'}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Registered Sessions in Router */}
            <div>
              <h3 className="font-semibold text-sm text-gray-700 mb-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                Registered Sessions (Router)
              </h3>
              <div className="space-y-2">
                {sessions.size === 0 ? (
                  <p className="text-xs text-gray-500 italic">No sessions registered</p>
                ) : (
                  Array.from(sessions.entries()).map(([type, session]) => (
                    <div
                      key={type}
                      // className={`border rounded p-2 text-xs ${
                      //   session.isActive
                      //     ? 'bg-green-50 border-green-200'
                      //     : 'bg-gray-50 border-gray-200'
                      // }`}
                    >
                      <div className="font-semibold text-green-900 flex items-center justify-between">
                        <span>{type}</span>
                        <span
                        // className={`text-[10px] px-2 py-0.5 rounded ${
                        //   session.isActive
                        //     ? 'bg-green-200 text-green-800'
                        //     : 'bg-gray-200 text-gray-800'
                        // }`}
                        >
                          {/* {session.isActive ? 'Active' : 'Inactive'} */}
                        </span>
                      </div>
                      <div className="text-gray-600 font-mono text-[10px] break-all">
                        {session.address}
                      </div>
                      <div className="text-gray-500 mt-1">
                        Chain: {session.chainId} | Wallet: {session.walletId}
                      </div>
                      <div
                        className={`mt-1 ${session.provider ? 'text-green-600' : 'text-red-600'}`}
                      >
                        Provider: {session.provider ? '✓ Available' : '✗ Missing'}
                      </div>
                      <div className="text-gray-400 text-[10px] mt-1">
                        {/* Last used: {new Date(session.lastUsed).toLocaleTimeString()} */}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Active Transactions */}
            <div>
              <h3 className="font-semibold text-sm text-gray-700 mb-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                Active Transactions
              </h3>
              <div className="bg-orange-50 border border-orange-200 rounded p-2 text-xs">
                <div className="font-semibold text-orange-900">
                  Count: {activeTransactionsCount}
                </div>
                {activeTransactionsCount > 0 ? (
                  <div className="text-orange-700 mt-1">Transactions are being processed...</div>
                ) : (
                  <div className="text-gray-500 mt-1">No active transactions</div>
                )}
              </div>
            </div>

            {/* Session Mismatch Detection */}
            <div>
              <h3 className="font-semibold text-sm text-gray-700 mb-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
                Validation Status
              </h3>
              <div className="space-y-1">
                {[WalletType.EVM, WalletType.STELLAR, WalletType.COSMOS].map(walletType => {
                  const connectedWallet = connectedWallets[walletType];
                  const routerSession = sessions.get(walletType);

                  const isConnected = !!connectedWallet;
                  const isRegistered = !!routerSession;
                  const addressMatch =
                    connectedWallet && routerSession
                      ? connectedWallet.address.toLowerCase() ===
                        routerSession.address.toLowerCase()
                      : false;
                  const providerAvailable = routerSession ? !!routerSession.provider : false;

                  let status = 'Not Connected';
                  let bgColor = 'bg-gray-100';
                  let textColor = 'text-gray-600';

                  if (isConnected && isRegistered && addressMatch && providerAvailable) {
                    status = '✓ Ready';
                    bgColor = 'bg-green-100';
                    textColor = 'text-green-700';
                  } else if (isConnected && !isRegistered) {
                    status = '⚠ Not Registered';
                    bgColor = 'bg-yellow-100';
                    textColor = 'text-yellow-700';
                  } else if (isConnected && isRegistered && !addressMatch) {
                    status = '✗ Address Mismatch';
                    bgColor = 'bg-red-100';
                    textColor = 'text-red-700';
                  } else if (isConnected && isRegistered && !providerAvailable) {
                    status = '✗ No Provider';
                    bgColor = 'bg-red-100';
                    textColor = 'text-red-700';
                  }

                  return (
                    <div
                      key={walletType}
                      className={`${bgColor} rounded px-2 py-1 text-xs flex items-center justify-between`}
                    >
                      <span className="font-medium">{walletType}</span>
                      <span className={`${textColor} font-semibold`}>{status}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Actions */}
            <div>
              <h3 className="font-semibold text-sm text-gray-700 mb-2">Quick Actions</h3>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    console.log('=== WALLET STORE ===');
                    console.log('Connected Wallets:', connectedWallets);
                    console.log('\n=== TRANSACTION ROUTER ===');
                    console.log('Registered Sessions:', Array.from(sessions.entries()));
                    console.log('Active Transactions:', activeTransactionsCount);
                    console.log('\n=== PROVIDERS ===');
                    Object.keys(WalletType).forEach(type => {
                      const provider = getProvider(type as WalletType);
                      console.log(`${type} Provider:`, provider);
                    });
                  }}
                  className="flex-1 bg-gray-600 hover:bg-gray-700 text-white text-xs px-3 py-1.5 rounded"
                >
                  Log to Console
                </button>
                <button
                  onClick={() => {
                    if (confirm('Clear all sessions? This will not disconnect wallets.')) {
                      transactionRouter.clearAllSessions();
                      setRefreshKey(prev => prev + 1);
                    }
                  }}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs px-3 py-1.5 rounded"
                >
                  Clear Sessions
                </button>
              </div>
            </div>
          </div>

          <div className="bg-gray-50 px-4 py-2 border-t text-xs text-gray-500 flex items-center justify-between">
            <span>Auto-refresh: {isExpanded ? 'ON' : 'OFF'}</span>
            <span>Key: {refreshKey}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default SessionDebugger;
