// import { CheckCircle2, Coins, FileText, Loader2, Send, XCircle } from 'lucide-react';
// import React, { useEffect, useState } from 'react';
// // import { Alert, AlertDescription } from '@/components/ui/alert';
// import { useWalletConnectStore } from '../../walletconnect/store/walletConnectStore';
// const StellarTransactionUI = () => {
//   const {
//     isConnected,
//     addresses,
//     activeChain,
//     getWallet,
//     activeWalletId,
//     connect,
//     retryStellarConnection,
//   } = useWalletConnectStore();
//   const [txType, setTxType] = useState('payment');
//   const [destination, setDestination] = useState('');
//   const [amount, setAmount] = useState('');
//   const [asset, setAsset] = useState('XLM');
//   const [memo, setMemo] = useState('');
//   const [isSubmitting, setIsSubmitting] = useState(false);
//   const [txStatus, setTxStatus] = useState(null);
//   const [txHash, setTxHash] = useState('');
//   const stellarAddress = addresses?.stellar;
//   const wallet = activeWalletId ? getWallet(activeWalletId) : null;
//   const stellarKit = wallet?.stellarKit;
//   const handleConnect = async () => {
//     try {
//       await connect(['stellar']);
//     } catch (error) {
//       console.error('Connection error:', error);
//       setTxStatus({ type: 'error', message: error.message });
//     }
//   };
//   const handleRetryConnection = async () => {
//     if (!activeWalletId) return;
//     try {
//       await retryStellarConnection(activeWalletId);
//       setTxStatus({ type: 'success', message: 'Connection restored!' });
//     } catch (error) {
//       setTxStatus({ type: 'error', message: error.message });
//     }
//   };
//   const buildPaymentTransaction = async () => {
//     if (!stellarKit) throw new Error('Stellar Kit not initialized');
//     const { Horizon, TransactionBuilder, Operation, Asset, BASE_FEE, Networks, Memo } =
//       await import('@stellar/stellar-sdk');
//     const server = new Horizon.Server('https://horizon-testnet.stellar.org');
//     const sourceAccount = await server.loadAccount(stellarAddress);
//     let transaction = new TransactionBuilder(sourceAccount, {
//       fee: BASE_FEE,
//       networkPassphrase: Networks.TESTNET,
//     });
//     // Add payment operation
//     if (asset === 'XLM') {
//       transaction = transaction.addOperation(
//         Operation.payment({
//           destination: destination,
//           asset: Asset.native(),
//           amount: amount,
//         })
//       );
//     } else {
//       // For custom assets, you'd need issuer address
//       // This is a placeholder
//       transaction = transaction.addOperation(
//         Operation.payment({
//           destination: destination,
//           asset: new Asset(asset, 'ISSUER_ADDRESS_HERE'),
//           amount: amount,
//         })
//       );
//     }
//     // Add memo if provided
//     if (memo) {
//       transaction = transaction.addMemo(Memo.text(memo));
//     }
//     // Set timeout and build
//     transaction = transaction.setTimeout(180).build();
//     return transaction.toXDR();
//   };
//   const buildTrustlineTransaction = async () => {
//     if (!stellarKit) throw new Error('Stellar Kit not initialized');
//     const { Horizon, TransactionBuilder, Operation, Asset, BASE_FEE, Networks } = await import(
//       '@stellar/stellar-sdk'
//     );
//     const server = new Horizon.Server('https://horizon-testnet.stellar.org');
//     const sourceAccount = await server.loadAccount(stellarAddress);
//     const transaction = new TransactionBuilder(sourceAccount, {
//       fee: BASE_FEE,
//       networkPassphrase: Networks.TESTNET,
//     })
//       .addOperation(
//         Operation.changeTrust({
//           asset: new Asset(asset, destination), // destination = issuer for trustline
//           limit: amount || undefined, // optional limit
//         })
//       )
//       .setTimeout(180)
//       .build();
//     return transaction.toXDR();
//   };
//   const handleSubmitTransaction = async () => {
//     if (!stellarKit || !stellarAddress) {
//       setTxStatus({ type: 'error', message: 'Stellar wallet not connected' });
//       return;
//     }
//     if (txType === 'payment' && (!destination || !amount)) {
//       setTxStatus({ type: 'error', message: 'Please fill in all required fields' });
//       return;
//     }
//     if (txType === 'trustline' && (!asset || !destination)) {
//       setTxStatus({ type: 'error', message: 'Please provide asset code and issuer address' });
//       return;
//     }
//     setIsSubmitting(true);
//     setTxStatus(null);
//     setTxHash('');
//     try {
//       let xdr;
//       if (txType === 'payment') {
//         xdr = await buildPaymentTransaction();
//       } else if (txType === 'trustline') {
//         xdr = await buildTrustlineTransaction();
//       }
//       console.log('Transaction XDR:', xdr);
//       // Sign the transaction using Stellar Kit
//       const { signedTxXdr } = await stellarKit.signTransaction(xdr, {
//         address: stellarAddress,
//         networkPassphrase: 'Test SDF Network ; September 2015',
//       });
//       console.log('Signed transaction:', signedTxXdr);
//       const { Horizon, TransactionBuilder, Networks } = await import('@stellar/stellar-sdk');
//       const server = new Horizon.Server('https://horizon-testnet.stellar.org');
//       const transaction = TransactionBuilder.fromXDR(signedTxXdr, Networks.TESTNET);
//       const result = await server.submitTransaction(transaction);
//       setTxHash(result.hash);
//       setTxStatus({
//         type: 'success',
//         message: `Transaction submitted successfully!`,
//       });
//       setDestination('');
//       setAmount('');
//       setMemo('');
//     } catch (error) {
//       console.error('Transaction error:', error);
//       let errorMessage = 'Transaction failed';
//       if (error.message?.includes('rejected')) {
//         errorMessage = 'Transaction rejected by user';
//       } else if (error.message?.includes('timeout')) {
//         errorMessage = 'Transaction timeout - please try again';
//       } else if (error.response?.data?.extras?.result_codes) {
//         errorMessage = `Transaction failed: ${JSON.stringify(error.response.data.extras.result_codes)}`;
//       } else if (error.message) {
//         errorMessage = error.message;
//       }
//       setTxStatus({ type: 'error', message: errorMessage });
//     } finally {
//       setIsSubmitting(false);
//     }
//   };
//   if (!isConnected || activeChain !== 'stellar' || !stellarAddress) {
//     return (
//       <div className="min-h-screen bg-gradient-to-br from-purple-900 via-indigo-900 to-blue-900 flex items-center justify-center p-4">
//         <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 max-w-md w-full border border-white/20">
//           <div className="text-center mb-6">
//             <div className="inline-flex items-center justify-center w-16 h-16 bg-purple-500/20 rounded-full mb-4">
//               <Coins className="w-8 h-8 text-purple-300" />
//             </div>
//             <h2 className="text-2xl font-bold text-white mb-2">Stellar Transactions</h2>
//             <p className="text-purple-200">Connect your Stellar wallet to begin</p>
//           </div>
//           {/* {activeWalletId && activeChain !== 'stellar' ? (
//             <Alert className="mb-4 bg-yellow-500/10 border-yellow-500/30">
//               <AlertDescription className="text-yellow-200">
//                 Please switch to Stellar network to use transactions
//               </AlertDescription>
//             </Alert>
//           ) : null} */}
//           <button
//             onClick={handleConnect}
//             className="w-full bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 transform hover:scale-105"
//           >
//             Connect Stellar Wallet
//           </button>
//         </div>
//       </div>
//     );
//   }
//   return (
//     <div className="min-h-screen bg-gradient-to-br from-purple-900 via-indigo-900 to-blue-900 p-4 md:p-8">
//       <div className="max-w-2xl mx-auto">
//         {/* Header */}
//         <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 mb-6 border border-white/20">
//           <div className="flex items-center justify-between">
//             <div>
//               <h1 className="text-2xl font-bold text-white mb-1">Stellar Transactions</h1>
//               <p className="text-purple-200 text-sm">
//                 Connected: {stellarAddress.slice(0, 8)}...{stellarAddress.slice(-8)}
//               </p>
//             </div>
//             <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center">
//               <CheckCircle2 className="w-6 h-6 text-green-300" />
//             </div>
//           </div>
//         </div>
//         {/* Transaction Type Selection */}
//         <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 mb-6 border border-white/20">
//           <label className="block text-white font-semibold mb-3">Transaction Type</label>
//           <div className="grid grid-cols-2 gap-3">
//             <button
//               onClick={() => setTxType('payment')}
//               className={`p-4 rounded-lg border-2 transition-all ${
//                 txType === 'payment'
//                   ? 'bg-purple-500/30 border-purple-400 text-white'
//                   : 'bg-white/5 border-white/10 text-purple-200 hover:bg-white/10'
//               }`}
//             >
//               <Send className="w-6 h-6 mx-auto mb-2" />
//               <div className="font-semibold">Payment</div>
//             </button>
//             <button
//               onClick={() => setTxType('trustline')}
//               className={`p-4 rounded-lg border-2 transition-all ${
//                 txType === 'trustline'
//                   ? 'bg-purple-500/30 border-purple-400 text-white'
//                   : 'bg-white/5 border-white/10 text-purple-200 hover:bg-white/10'
//               }`}
//             >
//               <FileText className="w-6 h-6 mx-auto mb-2" />
//               <div className="font-semibold">Trustline</div>
//             </button>
//           </div>
//         </div>
//         {/* Transaction Form */}
//         <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-6 mb-6 border border-white/20">
//           {txType === 'payment' ? (
//             <>
//               <div className="mb-4">
//                 <label className="block text-white font-semibold mb-2">Destination Address</label>
//                 <input
//                   type="text"
//                   value={destination}
//                   onChange={e => setDestination(e.target.value)}
//                   placeholder="G..."
//                   className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-purple-300/50 focus:outline-none focus:ring-2 focus:ring-purple-500"
//                 />
//               </div>
//               <div className="grid grid-cols-2 gap-4 mb-4">
//                 <div>
//                   <label className="block text-white font-semibold mb-2">Amount</label>
//                   <input
//                     type="text"
//                     value={amount}
//                     onChange={e => setAmount(e.target.value)}
//                     placeholder="10.00"
//                     className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-purple-300/50 focus:outline-none focus:ring-2 focus:ring-purple-500"
//                   />
//                 </div>
//                 <div>
//                   <label className="block text-white font-semibold mb-2">Asset</label>
//                   <select
//                     value={asset}
//                     onChange={e => setAsset(e.target.value)}
//                     className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
//                   >
//                     <option value="XLM">XLM (Native)</option>
//                     <option value="USDC">USDC</option>
//                     <option value="custom">Custom Asset</option>
//                   </select>
//                 </div>
//               </div>
//               <div className="mb-4">
//                 <label className="block text-white font-semibold mb-2">Memo (Optional)</label>
//                 <input
//                   type="text"
//                   value={memo}
//                   onChange={e => setMemo(e.target.value)}
//                   placeholder="Transaction memo"
//                   maxLength={28}
//                   className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-purple-300/50 focus:outline-none focus:ring-2 focus:ring-purple-500"
//                 />
//                 <p className="text-purple-300/70 text-xs mt-1">{memo.length}/28 characters</p>
//               </div>
//             </>
//           ) : (
//             <>
//               <div className="mb-4">
//                 <label className="block text-white font-semibold mb-2">Asset Code</label>
//                 <input
//                   type="text"
//                   value={asset}
//                   onChange={e => setAsset(e.target.value.toUpperCase())}
//                   placeholder="USDC"
//                   maxLength={12}
//                   className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-purple-300/50 focus:outline-none focus:ring-2 focus:ring-purple-500"
//                 />
//               </div>
//               <div className="mb-4">
//                 <label className="block text-white font-semibold mb-2">Issuer Address</label>
//                 <input
//                   type="text"
//                   value={destination}
//                   onChange={e => setDestination(e.target.value)}
//                   placeholder="G..."
//                   className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-purple-300/50 focus:outline-none focus:ring-2 focus:ring-purple-500"
//                 />
//               </div>
//               <div className="mb-4">
//                 <label className="block text-white font-semibold mb-2">
//                   Trust Limit (Optional)
//                 </label>
//                 <input
//                   type="text"
//                   value={amount}
//                   onChange={e => setAmount(e.target.value)}
//                   placeholder="Leave empty for unlimited"
//                   className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-purple-300/50 focus:outline-none focus:ring-2 focus:ring-purple-500"
//                 />
//               </div>
//             </>
//           )}
//         </div>
//         {/* Status Messages */}
//         {txStatus && (
//           <div
//             className={`rounded-lg p-4 mb-6 ${
//               txStatus.type === 'success'
//                 ? 'bg-green-500/20 border border-green-500/30'
//                 : 'bg-red-500/20 border border-red-500/30'
//             }`}
//           >
//             <div className="flex items-start">
//               {txStatus.type === 'success' ? (
//                 <CheckCircle2 className="w-5 h-5 text-green-300 mt-0.5 mr-3 flex-shrink-0" />
//               ) : (
//                 <XCircle className="w-5 h-5 text-red-300 mt-0.5 mr-3 flex-shrink-0" />
//               )}
//               <div className="flex-1">
//                 <p className={txStatus.type === 'success' ? 'text-green-100' : 'text-red-100'}>
//                   {txStatus.message}
//                 </p>
//                 {txHash && (
//                   <a
//                     href={`https://stellar.expert/explorer/testnet/tx/${txHash}`}
//                     target="_blank"
//                     rel="noopener noreferrer"
//                     className="text-purple-300 hover:text-purple-200 underline text-sm mt-2 inline-block"
//                   >
//                     View on Explorer →
//                   </a>
//                 )}
//               </div>
//             </div>
//           </div>
//         )}
//         {/* Action Buttons */}
//         <div className="flex gap-3">
//           <button
//             onClick={handleSubmitTransaction}
//             disabled={isSubmitting}
//             className="flex-1 bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 disabled:from-gray-500 disabled:to-gray-600 disabled:cursor-not-allowed text-white font-semibold py-4 px-6 rounded-lg transition-all duration-200 transform hover:scale-105 disabled:transform-none flex items-center justify-center"
//           >
//             {isSubmitting ? (
//               <>
//                 <Loader2 className="w-5 h-5 mr-2 animate-spin" />
//                 Processing...
//               </>
//             ) : (
//               <>
//                 <Send className="w-5 h-5 mr-2" />
//                 {txType === 'payment' ? 'Send Payment' : 'Create Trustline'}
//               </>
//             )}
//           </button>
//           {wallet?.connectionRetries > 0 && (
//             <button
//               onClick={handleRetryConnection}
//               className="bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-500/30 text-yellow-100 font-semibold py-4 px-6 rounded-lg transition-all"
//             >
//               Retry Connection
//             </button>
//           )}
//         </div>
//         {/* Info Box */}
//         <div className="mt-6 bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
//           <p className="text-blue-200 text-sm">
//             <strong>Note:</strong> This is a testnet interface. Transactions are submitted to the
//             Stellar testnet. Make sure you have testnet XLM in your account to pay for transaction
//             fees.
//           </p>
//         </div>
//       </div>
//     </div>
//   );
// };
// export default StellarTransactionUI;

const StellarTransactionUI = () => {
  return <div>StellarTransactionUI</div>;
};

export default StellarTransactionUI;
