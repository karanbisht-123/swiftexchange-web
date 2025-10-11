// import { useEffect, useState } from 'react';
// import { useWalletConnect } from '../../walletconnect/hooks/useWalletConnect';
// import { DydxConnectionModal } from '../components/DydxConnectionModal';
// import { useDydx } from '../hooks/useWallet';
// export function DydxIntegrationExample() {
//   const wallet = useWalletConnect();
//   const dydx = useDydx();
//   const [showModal, setShowModal] = useState(false);
//   // Show modal when connection starts
//   useEffect(() => {
//     if (dydx.isLoading && !dydx.isConnected) {
//       setShowModal(true);
//     }
//   }, [dydx.isLoading, dydx.isConnected]);
//   // Hide modal after successful connection (with delay for better UX)
//   useEffect(() => {
//     if (dydx.isConnected && showModal) {
//       const timer = setTimeout(() => {
//         setShowModal(false);
//       }, 2000); // Show success for 2 seconds
//       return () => clearTimeout(timer);
//     }
//   }, [dydx.isConnected, showModal]);
//   // Auto-refresh data periodically when connected
//   useEffect(() => {
//     if (dydx.isConnected) {
//       const interval = setInterval(() => {
//         dydx.refreshAll();
//       }, 30000); // Refresh every 30 seconds
//       return () => clearInterval(interval);
//     }
//   }, [dydx.isConnected]);
//   const handleSwitchNetwork = async () => {
//     try {
//       const newNetwork = dydx.network === 'testnet' ? 'mainnet' : 'testnet';
//       await dydx.switchNetwork(newNetwork);
//     } catch (error: any) {
//       alert(`Failed to switch network: ${error.message}`);
//     }
//   };
//   const handleDisconnect = () => {
//     wallet.disconnect();
//     // dYdX will auto-disconnect via the hook's useEffect
//   };
//   return (
//     <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-8">
//       <div className="max-w-6xl mx-auto">
//         {/* Header */}
//         <div className="text-center mb-12">
//           <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
//             dYdX Integration
//           </h1>
//           <p className="text-gray-600 dark:text-gray-300">
//             Connect your wallet to start trading on dYdX
//           </p>
//         </div>
//         {/* Connection Modal */}
//         <DydxConnectionModal isOpen={showModal} onClose={() => setShowModal(false)} />
//         {/* Main Content */}
//         <div className="grid gap-6">
//           {/* Wallet Connection Card */}
//           <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
//             <div className="flex items-center justify-between">
//               <div>
//                 <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
//                   Wallet Connection
//                 </h2>
//                 {!wallet.isConnected ? (
//                   <p className="text-gray-600 dark:text-gray-300">
//                     Connect your wallet to get started
//                   </p>
//                 ) : (
//                   <div className="space-y-1">
//                     <div className="flex items-center gap-2">
//                       <span className="w-2 h-2 bg-green-500 rounded-full"></span>
//                       <p className="text-sm text-gray-600 dark:text-gray-300">
//                         EVM: {wallet.addresses.evm?.slice(0, 6)}...
//                         {wallet.addresses.evm?.slice(-4)}
//                       </p>
//                     </div>
//                     {dydx.isConnected && (
//                       <div className="flex items-center gap-2">
//                         <span className="w-2 h-2 bg-purple-500 rounded-full"></span>
//                         <p className="text-sm text-gray-600 dark:text-gray-300">
//                           dYdX: {dydx.address?.slice(0, 10)}...
//                           {dydx.address?.slice(-4)}
//                         </p>
//                       </div>
//                     )}
//                   </div>
//                 )}
//               </div>
//               <div>
//                 {!wallet.isConnected ? (
//                   <button
//                     onClick={() => wallet.connect(['evm'])}
//                     className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors shadow-md"
//                   >
//                     Connect Wallet
//                   </button>
//                 ) : (
//                   <button
//                     onClick={handleDisconnect}
//                     className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition-colors shadow-md"
//                   >
//                     Disconnect
//                   </button>
//                 )}
//               </div>
//             </div>
//           </div>
//           {/* dYdX Account Info */}
//           {dydx.isConnected && (
//             <>
//               {/* Network & Controls */}
//               <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
//                 <div className="flex items-center justify-between mb-4">
//                   <h3 className="text-xl font-bold text-gray-900 dark:text-white">Network</h3>
//                   <div className="flex items-center gap-4">
//                     <span className="px-4 py-2 bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 rounded-lg font-semibold">
//                       {dydx.network.toUpperCase()}
//                     </span>
//                     <button
//                       onClick={handleSwitchNetwork}
//                       disabled={dydx.isLoading}
//                       className="px-4 py-2 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-400 text-white rounded-lg font-semibold transition-colors"
//                     >
//                       Switch to {dydx.network === 'testnet' ? 'Mainnet' : 'Testnet'}
//                     </button>
//                   </div>
//                 </div>
//               </div>
//               {/* Balances */}
//               <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
//                 <div className="flex items-center justify-between mb-4">
//                   <h3 className="text-xl font-bold text-gray-900 dark:text-white">
//                     Account Balance
//                   </h3>
//                   <button
//                     onClick={dydx.refreshBalances}
//                     disabled={dydx.isLoading}
//                     className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
//                   >
//                     <svg
//                       className={`w-5 h-5 ${dydx.isLoading ? 'animate-spin' : ''}`}
//                       fill="none"
//                       viewBox="0 0 24 24"
//                       stroke="currentColor"
//                     >
//                       <path
//                         strokeLinecap="round"
//                         strokeLinejoin="round"
//                         strokeWidth={2}
//                         d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
//                       />
//                     </svg>
//                   </button>
//                 </div>
//                 <div className="grid grid-cols-2 gap-4">
//                   {dydx.balances.map((balance, index) => (
//                     <div
//                       key={index}
//                       className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-gray-700 dark:to-gray-600 rounded-lg p-4"
//                     >
//                       <p className="text-sm text-gray-600 dark:text-gray-300 mb-1">
//                         {balance.denom}
//                       </p>
//                       <p className="text-2xl font-bold text-gray-900 dark:text-white">
//                         ${parseFloat(balance.amount || '0').toLocaleString()}
//                       </p>
//                     </div>
//                   ))}
//                 </div>
//               </div>
//               {/* Positions */}
//               <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
//                 <div className="flex items-center justify-between mb-4">
//                   <h3 className="text-xl font-bold text-gray-900 dark:text-white">
//                     Open Positions ({dydx.positions.length})
//                   </h3>
//                   <button
//                     onClick={dydx.refreshPositions}
//                     disabled={dydx.isLoading}
//                     className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
//                   >
//                     <svg
//                       className={`w-5 h-5 ${dydx.isLoading ? 'animate-spin' : ''}`}
//                       fill="none"
//                       viewBox="0 0 24 24"
//                       stroke="currentColor"
//                     >
//                       <path
//                         strokeLinecap="round"
//                         strokeLinejoin="round"
//                         strokeWidth={2}
//                         d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
//                       />
//                     </svg>
//                   </button>
//                 </div>
//                 {dydx.positions.length === 0 ? (
//                   <div className="text-center py-12">
//                     <div className="text-6xl mb-4">📊</div>
//                     <p className="text-gray-500 dark:text-gray-400">No open positions</p>
//                     <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
//                       Start trading to see your positions here
//                     </p>
//                   </div>
//                 ) : (
//                   <div className="space-y-3">
//                     {dydx.positions.map((position: any, index) => (
//                       <div
//                         key={index}
//                         className="border border-gray-200 dark:border-gray-600 rounded-lg p-4 hover:border-blue-500 dark:hover:border-blue-400 transition-colors"
//                       >
//                         <div className="flex items-center justify-between">
//                           <div>
//                             <p className="font-bold text-gray-900 dark:text-white">
//                               {position.market}
//                             </p>
//                             <p className="text-sm text-gray-600 dark:text-gray-300">
//                               Size: {position.size}
//                             </p>
//                           </div>
//                           <div className="text-right">
//                             <span
//                               className={`px-3 py-1 rounded-full text-sm font-semibold ${
//                                 position.side === 'LONG'
//                                   ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
//                                   : 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
//                               }`}
//                             >
//                               {position.side}
//                             </span>
//                             <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
//                               Entry: ${position.entryPrice}
//                             </p>
//                             <p
//                               className={`text-sm font-semibold ${
//                                 parseFloat(position.unrealizedPnl) >= 0
//                                   ? 'text-green-600 dark:text-green-400'
//                                   : 'text-red-600 dark:text-red-400'
//                               }`}
//                             >
//                               PnL: {parseFloat(position.unrealizedPnl) >= 0 ? '+' : ''}$
//                               {parseFloat(position.unrealizedPnl).toFixed(2)}
//                             </p>
//                           </div>
//                         </div>
//                       </div>
//                     ))}
//                   </div>
//                 )}
//               </div>
//               {/* Markets Preview */}
//               <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
//                 <div className="flex items-center justify-between mb-4">
//                   <h3 className="text-xl font-bold text-gray-900 dark:text-white">Markets</h3>
//                   <button
//                     onClick={dydx.refreshMarkets}
//                     disabled={dydx.isLoading}
//                     className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
//                   >
//                     <svg
//                       className={`w-5 h-5 ${dydx.isLoading ? 'animate-spin' : ''}`}
//                       fill="none"
//                       viewBox="0 0 24 24"
//                       stroke="currentColor"
//                     >
//                       <path
//                         strokeLinecap="round"
//                         strokeLinejoin="round"
//                         strokeWidth={2}
//                         d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
//                       />
//                     </svg>
//                   </button>
//                 </div>
//                 <div className="overflow-x-auto">
//                   <table className="w-full">
//                     <thead>
//                       <tr className="border-b border-gray-200 dark:border-gray-700">
//                         <th className="text-left py-3 px-4 text-gray-600 dark:text-gray-300 font-semibold">
//                           Market
//                         </th>
//                         <th className="text-right py-3 px-4 text-gray-600 dark:text-gray-300 font-semibold">
//                           Price
//                         </th>
//                         <th className="text-right py-3 px-4 text-gray-600 dark:text-gray-300 font-semibold">
//                           24h Change
//                         </th>
//                         <th className="text-right py-3 px-4 text-gray-600 dark:text-gray-300 font-semibold">
//                           Volume
//                         </th>
//                       </tr>
//                     </thead>
//                     <tbody>
//                       {dydx.markets.slice(0, 10).map((market: any, index) => (
//                         <tr
//                           key={index}
//                           className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
//                         >
//                           <td className="py-3 px-4 font-semibold text-gray-900 dark:text-white">
//                             {market.ticker}
//                           </td>
//                           <td className="py-3 px-4 text-right text-gray-900 dark:text-white">
//                             ${parseFloat(market.oraclePrice || '0').toLocaleString()}
//                           </td>
//                           <td
//                             className={`py-3 px-4 text-right font-semibold ${
//                               parseFloat(market.priceChange24h) >= 0
//                                 ? 'text-green-600 dark:text-green-400'
//                                 : 'text-red-600 dark:text-red-400'
//                             }`}
//                           >
//                             {parseFloat(market.priceChange24h) >= 0 ? '+' : ''}
//                             {parseFloat(market.priceChange24h).toFixed(2)}%
//                           </td>
//                           <td className="py-3 px-4 text-right text-gray-900 dark:text-white">
//                             ${parseFloat(market.volume24h || '0').toLocaleString()}
//                           </td>
//                         </tr>
//                       ))}
//                     </tbody>
//                   </table>
//                 </div>
//               </div>
//             </>
//           )}
//           {/* Error Display */}
//           {dydx.error && !showModal && (
//             <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
//               <div className="flex items-start gap-3">
//                 <span className="text-2xl">⚠️</span>
//                 <div className="flex-1">
//                   <h4 className="font-semibold text-red-800 dark:text-red-300 mb-1">
//                     Connection Error
//                   </h4>
//                   <p className="text-red-700 dark:text-red-400 text-sm">{dydx.error}</p>
//                   <button
//                     onClick={() => wallet.isConnected && dydx.connectDydx()}
//                     className="mt-3 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold transition-colors"
//                   >
//                     Retry Connection
//                   </button>
//                 </div>
//               </div>
//             </div>
//           )}
//           {/* Loading State (when wallet is connected but dYdX is initializing) */}
//           {wallet.isConnected && !dydx.isConnected && dydx.isLoading && (
//             <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-6">
//               <div className="flex items-center gap-4">
//                 <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
//                 <div>
//                   <h4 className="font-semibold text-blue-800 dark:text-blue-300">
//                     Connecting to dYdX...
//                   </h4>
//                   <p className="text-blue-700 dark:text-blue-400 text-sm">
//                     Please check your wallet for a signature request
//                   </p>
//                 </div>
//               </div>
//             </div>
//           )}
//         </div>
//         {/* Footer Info */}
//         <div className="mt-12 text-center text-sm text-gray-500 dark:text-gray-400">
//           <p>
//             Powered by{' '}
//             <a
//               href="https://dydx.exchange"
//               target="_blank"
//               rel="noopener noreferrer"
//               className="text-blue-600 dark:text-blue-400 hover:underline"
//             >
//               dYdX v4
//             </a>
//           </p>
//         </div>
//       </div>
//     </div>
//   );
// }

const DydxIntegrationExample = () => {
  return <div>DydxIntegrationExample</div>;
};

export default DydxIntegrationExample;
