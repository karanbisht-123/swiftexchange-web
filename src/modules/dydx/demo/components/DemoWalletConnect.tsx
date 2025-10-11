import {
  CheckCircle,
  // TrendingUp,
  // TrendingDown,
  Copy,
  LogOut,
  RefreshCw,
  Wallet,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { useDemoWallet } from '../hook/useDemoWallet';

export default function DemoWalletConnect() {
  const {
    isConnected,
    isLoading,
    address,
    // balance,
    subaccountBalance,
    currentSubaccount,
    subaccounts,
    error,
    connectWallet,
    disconnectWallet,
    fetchAllData,
    createSubaccount,
    switchSubaccount,
  } = useDemoWallet();

  const [showDetails, setShowDetails] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isConnected) {
      fetchAllData();
      const interval = setInterval(() => {
        fetchAllData();
      }, 10000);
      return () => clearInterval(interval);
    }
  }, [isConnected, fetchAllData]);

  const handleConnect = async () => {
    await connectWallet();
  };

  const handleDisconnect = () => {
    disconnectWallet();
    setShowDetails(false);
  };

  const handleRefresh = () => {
    fetchAllData();
  };

  const copyAddress = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const formatAddress = (addr: any) => {
    return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
  };

  // const formatBalance = (amount: any, decimals = 18) => {
  //   const num = parseFloat(amount) / Math.pow(10, decimals);
  //   return num.toFixed(4);
  // };

  const formatCurrency = (value: any) => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(num)) return '0.00';
    return num.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  // const calculateTotalUnrealizedPnl = () => {
  //   if (!subaccountBalance?.openPerpetualPositions) return 0;
  //   const positions = Object.values(subaccountBalance.openPerpetualPositions);
  //   return positions.reduce((sum, pos) => {
  //     return sum + (parseFloat(pos.unrealizedPnl) || 0);
  //   }, 0);
  // };

  const calculateBuyingPower = () => {
    if (!subaccountBalance) return 0;
    return parseFloat(subaccountBalance.freeCollateral || '0');
  };

  // const getPositionCount = () => {
  //   if (!subaccountBalance?.openPerpetualPositions) return 0;
  //   return Object.keys(subaccountBalance.openPerpetualPositions).length;
  // };

  const handleCreateSubaccount = () => {
    const nextNumber = subaccounts.length;
    createSubaccount(nextNumber);
  };

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-8 shadow-2xl border border-purple-500/20 max-w-md w-full">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-purple-500/20 rounded-full mb-4">
              <Wallet className="w-8 h-8 text-purple-400" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">dYdX Demo Wallet</h1>
            <p className="text-slate-400">Connect your REAL wallet using mnemonic</p>
            <p className="text-xs text-purple-400 mt-2">
              ✓ Real wallet • ✓ Real balance • ✓ Real trading
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}

          <button
            onClick={handleConnect}
            disabled={isLoading}
            className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold py-4 px-6 rounded-xl transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-purple-500/30"
          >
            {isLoading ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                <Wallet className="w-5 h-5" />
                Connect Demo Wallet
              </>
            )}
          </button>

          <div className="mt-6 text-center">
            <p className="text-xs text-slate-500">Using testnet • Secure mnemonic from env</p>
          </div>
        </div>
      </div>
    );
  }

  // const totalUnrealizedPnl = calculateTotalUnrealizedPnl();
  // const isPnlPositive = totalUnrealizedPnl >= 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
      <div className="max-w-6xl mx-auto">
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 shadow-2xl border border-purple-500/20 mb-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
                <Wallet className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Demo Wallet</h2>
                <div className="flex items-center gap-2 mt-1">
                  <code className="text-sm text-slate-300 bg-slate-700/50 px-2 py-1 rounded">
                    {formatAddress(address)}
                  </code>
                  <button
                    onClick={copyAddress}
                    className="p-1 hover:bg-slate-700 rounded transition-colors"
                  >
                    {copied ? (
                      <CheckCircle className="w-4 h-4 text-green-400" />
                    ) : (
                      <Copy className="w-4 h-4 text-slate-400" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleRefresh}
                disabled={isLoading}
                className="p-3 bg-slate-700/50 hover:bg-slate-700 rounded-xl transition-colors disabled:opacity-50"
              >
                <RefreshCw
                  className={`w-5 h-5 text-purple-400 ${isLoading ? 'animate-spin' : ''}`}
                />
              </button>
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="px-4 py-3 bg-slate-700/50 hover:bg-slate-700 rounded-xl transition-colors text-white text-sm font-medium"
              >
                {showDetails ? 'Hide Details' : 'Show Details'}
              </button>
              <button
                onClick={handleDisconnect}
                className="px-4 py-3 bg-red-500/20 hover:bg-red-500/30 rounded-xl transition-colors text-red-400 text-sm font-medium flex items-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                Disconnect
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
          <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 border border-purple-500/20">
            <h3 className="text-sm font-medium text-slate-400 mb-2">Account Value</h3>
            <p className="text-3xl font-bold text-white mb-1">
              ${subaccountBalance?.equity ? formatCurrency(subaccountBalance.equity) : '0.00'}
            </p>
            <p className="text-xs text-slate-500">Total Equity</p>
          </div>

          <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 border border-purple-500/20">
            <h3 className="text-sm font-medium text-slate-400 mb-2">Buying Power</h3>
            <p className="text-3xl font-bold text-white mb-1">
              ${formatCurrency(calculateBuyingPower())}
            </p>
            <p className="text-xs text-green-400">Available to Trade</p>
          </div>

          <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 border border-purple-500/20">
            <h3 className="text-sm font-medium text-slate-400 mb-2">Unrealized PnL</h3>

            {/* <p className="text-xs text-slate-500">
              {getPositionCount()} Open Position
              {getPositionCount() !== 1 ? "s" : ""}
            </p> */}
          </div>

          <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 border border-purple-500/20">
            <h3 className="text-sm font-medium text-slate-400 mb-2">Margin Usage</h3>
            <p className="text-3xl font-bold text-white mb-2">
              {subaccountBalance?.marginUsage
                ? parseFloat(subaccountBalance.marginUsage).toFixed(2)
                : '0.00'}
              %
            </p>
            <div className="w-full bg-slate-700 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${
                  parseFloat(subaccountBalance?.marginUsage || '0') > 80
                    ? 'bg-red-500'
                    : parseFloat(subaccountBalance?.marginUsage || '0') > 50
                      ? 'bg-yellow-500'
                      : 'bg-green-500'
                }`}
                style={{
                  width: `${Math.min(parseFloat(subaccountBalance?.marginUsage || '0'), 100)}%`,
                }}
              />
            </div>
          </div>
        </div>

        <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl p-6 border border-purple-500/20 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Subaccounts</h3>
            <button
              onClick={handleCreateSubaccount}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-white text-sm font-medium transition-colors"
            >
              Create New
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {subaccounts.map(sub => (
              <button
                key={sub.subaccountNumber}
                onClick={() => switchSubaccount(sub.subaccountNumber)}
                className={`p-4 rounded-lg border-2 transition-all ${
                  currentSubaccount?.subaccountNumber === sub.subaccountNumber
                    ? 'border-purple-500 bg-purple-500/10'
                    : 'border-slate-700 bg-slate-700/30 hover:border-slate-600'
                }`}
              >
                <div className="text-sm font-medium text-white mb-1">
                  Subaccount #{sub.subaccountNumber}
                </div>
                <div className="text-xs text-slate-400">{formatAddress(sub.subaccountId)}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
