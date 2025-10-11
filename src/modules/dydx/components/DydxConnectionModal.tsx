// import React from 'react';

// import { useDydx } from '../hooks/useWallet';

// interface ConnectionStep {
//   id: string;
//   title: string;
//   description: string;
//   icon: string;
// }

// const CONNECTION_STEPS: ConnectionStep[] = [
//   {
//     id: 'signing',
//     title: 'Sign Message',
//     description: 'Please sign the message in your wallet to generate your dYdX address',
//     icon: '✍️',
//   },
//   {
//     id: 'deriving',
//     title: 'Generating Wallet',
//     description: 'Creating your dYdX wallet from signature...',
//     icon: '🔑',
//   },
//   {
//     id: 'initializing',
//     title: 'Setting Up Account',
//     description: 'Initializing your dYdX account and connecting to network...',
//     icon: '⚙️',
//   },
//   {
//     id: 'fetching',
//     title: 'Loading Data',
//     description: 'Fetching your balances, positions, and market data...',
//     icon: '📊',
//   },
//   {
//     id: 'connected',
//     title: 'Connected!',
//     description: 'Successfully connected to dYdX',
//     icon: '✅',
//   },
// ];

// interface DydxConnectionModalProps {
//   isOpen: boolean;
//   onClose: () => void;
// }

// export const DydxConnectionModal: React.FC<DydxConnectionModalProps> = ({ isOpen, onClose }) => {
//   const { connectionStep, isLoading, error, address } = useDydx();

//   if (!isOpen) return null;

//   const currentStepIndex = CONNECTION_STEPS.findIndex(step => step.id === connectionStep);
//   const currentStep = CONNECTION_STEPS[currentStepIndex] || CONNECTION_STEPS[0];
//   const isConnected = connectionStep === 'connected';

//   return (
//     <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50 backdrop-blur-sm">
//       <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-6 relative">
//         {/* Close button - only show when connected or error */}
//         {(isConnected || error) && (
//           <button
//             onClick={onClose}
//             className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
//           >
//             <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
//               <path
//                 strokeLinecap="round"
//                 strokeLinejoin="round"
//                 strokeWidth={2}
//                 d="M6 18L18 6M6 6l12 12"
//               />
//             </svg>
//           </button>
//         )}

//         {/* Error State */}
//         {error && (
//           <div className="text-center">
//             <div className="text-6xl mb-4">❌</div>
//             <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
//               Connection Failed
//             </h2>
//             <p className="text-red-600 dark:text-red-400 mb-6">{error}</p>
//             <button
//               onClick={onClose}
//               className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
//             >
//               Close
//             </button>
//           </div>
//         )}

//         {/* Loading/Success State */}
//         {!error && (
//           <div className="text-center">
//             {/* Icon */}
//             <div className="text-6xl mb-4 animate-bounce">{currentStep.icon}</div>

//             {/* Title */}
//             <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
//               {currentStep.title}
//             </h2>

//             {/* Description */}
//             <p className="text-gray-600 dark:text-gray-300 mb-6">{currentStep.description}</p>

//             {/* Progress Steps */}
//             <div className="mb-6">
//               <div className="flex justify-between items-center mb-2">
//                 {CONNECTION_STEPS.slice(0, -1).map((step, index) => (
//                   <React.Fragment key={step.id}>
//                     <div
//                       className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all ${
//                         index <= currentStepIndex
//                           ? 'bg-blue-600 text-white'
//                           : 'bg-gray-200 dark:bg-gray-600 text-gray-500 dark:text-gray-400'
//                       }`}
//                     >
//                       {index < currentStepIndex ? '✓' : index + 1}
//                     </div>
//                     {index < CONNECTION_STEPS.length - 2 && (
//                       <div
//                         className={`flex-1 h-1 mx-2 transition-all ${
//                           index < currentStepIndex ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-600'
//                         }`}
//                       />
//                     )}
//                   </React.Fragment>
//                 ))}
//               </div>
//             </div>

//             {/* Loading Spinner */}
//             {isLoading && !isConnected && (
//               <div className="flex justify-center mb-4">
//                 <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
//               </div>
//             )}

//             {/* Success - Show Address */}
//             {isConnected && address && (
//               <div className="bg-gray-100 dark:bg-gray-700 rounded-lg p-4 mb-6">
//                 <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Your dYdX Address</p>
//                 <p className="text-sm font-mono text-gray-900 dark:text-white break-all">
//                   {address}
//                 </p>
//               </div>
//             )}

//             {/* Close button when connected */}
//             {isConnected && (
//               <button
//                 onClick={onClose}
//                 className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold"
//               >
//                 Start Trading
//               </button>
//             )}

//             {/* Helper text */}
//             {connectionStep === 'signing' && (
//               <p className="text-xs text-gray-500 dark:text-gray-400 mt-4">
//                 Check your wallet for a signature request
//               </p>
//             )}
//           </div>
//         )}
//       </div>
//     </div>
//   );
// };

const DydxConnectionModal = () => {
  return <div>DydxConnectionModal</div>;
};

export default DydxConnectionModal;
