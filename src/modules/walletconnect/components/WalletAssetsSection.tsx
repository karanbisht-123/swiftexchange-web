// import { ArrowDownRight, ArrowUpRight, Loader2, RefreshCw } from 'lucide-react';
// import { type FC, memo, useRef, useState } from 'react';
// import { useNavigate } from 'react-router-dom';
// import { ROUTES } from '../../../constants/routes';
// import { type Asset, useWalletAssets } from '../hooks/useWalletAssets';
// interface AssetsSectionProps {
//   title?: string;
// }
// const Shimmer = ({ width = 'w-20', height = 'h-4' }: { width?: string; height?: string }) => (
//   <div
//     className={`${width} ${height} bg-gray-200 dark:bg-gray-700 rounded animate-pulse relative overflow-hidden`}
//   >
//     <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
//   </div>
// );
// const AssetRow = memo(
//   ({
//     asset,
//     isLast,
//     onTradeClick,
//   }: {
//     asset: Asset;
//     isLast: boolean;
//     onTradeClick: (asset: Asset) => void;
//   }) => {
//     const [isSwiped, setIsSwiped] = useState(false);
//     const touchStartX = useRef<number>(0);
//     const handleTouchStart = (e: React.TouchEvent) => {
//       touchStartX.current = e.touches[0].clientX;
//     };
//     const handleTouchMove = (e: React.TouchEvent) => {
//       const diff = touchStartX.current - e.touches[0].clientX;
//       if (diff > 50) setIsSwiped(true);
//       else if (diff < -20) setIsSwiped(false);
//     };
//     const handleTrade = () => {
//       onTradeClick(asset);
//       setIsSwiped(false);
//     };
//     const isPriceLoading = asset.current_price === 0 && asset.balance > 0;
//     const usdValue = asset.balance * asset.current_price;
//     const high = asset.current_price * 1.05;
//     const low = asset.current_price * 0.95;
//     const canTrade = ['ETH', 'BNB', 'XLM'].includes(asset.symbol.toUpperCase());
//     return (
//       <div
//         className={`relative ${
//           !isLast ? 'border-b border-color/50' : ''
//         } hover:bg-black/5 dark:hover:bg-white/5 transition-colors`}
//       >
//         {/* Swipe Action (Mobile) */}
//         {canTrade && (
//           <div
//             className={`absolute right-0 top-0 bottom-0 flex items-center gap-2 px-4 transition-opacity duration-200 ${
//               isSwiped ? 'opacity-100' : 'opacity-0 pointer-events-none'
//             }`}
//           >
//             <button
//               onClick={handleTrade}
//               className="btn-primary btn-sm px-5 py-2 rounded-full shadow-md"
//             >
//               Trade
//             </button>
//           </div>
//         )}
//         {/* Asset Row */}
//         <div
//           className={`grid grid-cols-4 sm:grid-cols-5 items-center gap-4 px-4 py-4 transition-transform duration-200 ease-out ${
//             isSwiped && canTrade ? '-translate-x-32 sm:translate-x-0' : 'translate-x-0'
//           }`}
//           onTouchStart={canTrade ? handleTouchStart : undefined}
//           onTouchMove={canTrade ? handleTouchMove : undefined}
//           onTouchEnd={() => (touchStartX.current = 0)}
//         >
//           {/* Asset Info */}
//           <div className="flex items-center gap-3 min-w-0">
//             <div className="relative flex-shrink-0">
//               <img
//                 src={asset.image}
//                 alt={asset.name}
//                 className="w-11 h-11 rounded-full ring-2 ring-gray-200/50 dark:ring-gray-700/50 bg-white"
//                 loading="lazy"
//                 onError={e => {
//                   e.currentTarget.src = `https://via.placeholder.com/44/cccccc/666666?text=${asset.symbol.slice(0, 2)}`;
//                 }}
//               />
//             </div>
//             <div className="min-w-0 flex-1">
//               <div className="font-bold text-primary text-sm truncate">
//                 {asset.name}
//                 {asset.chainName && (
//                   <span className="text-xs text-gray-400 ml-1">({asset.chainName})</span>
//                 )}
//               </div>
//               <span className="text-xs text-gray-500 uppercase font-medium">{asset.symbol}</span>
//             </div>
//           </div>
//           {/* Balance */}
//           <div className="text-sm font-medium text-secondary">
//             <div className="truncate">
//               {asset.balance.toLocaleString(undefined, { maximumFractionDigits: 4 })}
//             </div>
//             <span className="text-xs text-gray-400">{asset.symbol.toUpperCase()}</span>
//           </div>
//           {/* High / Low */}
//           <div className="text-center">
//             {isPriceLoading ? (
//               <div className="flex flex-col items-center gap-1">
//                 <Shimmer width="w-14" height="h-3" />
//                 <Shimmer width="w-14" height="h-3" />
//               </div>
//             ) : (
//               <>
//                 <div className="text-xs font-semibold text-green-500">${high.toFixed(2)}</div>
//                 <div className="text-xs font-semibold text-red-500">${low.toFixed(2)}</div>
//               </>
//             )}
//           </div>
//           {/* Value */}
//           <div className="text-right">
//             {isPriceLoading ? (
//               <div className="flex flex-col items-end gap-1">
//                 <Shimmer width="w-20" height="h-4" />
//                 <Shimmer width="w-14" height="h-3" />
//               </div>
//             ) : (
//               <>
//                 <div className="font-semibold text-primary text-sm">
//                   $
//                   {usdValue.toLocaleString(undefined, {
//                     minimumFractionDigits: 2,
//                     maximumFractionDigits: 2,
//                   })}
//                 </div>
//                 <div
//                   className={`flex items-center justify-end gap-1 text-xs font-medium ${
//                     asset.price_change_percentage_24h >= 0 ? 'text-green-500' : 'text-red-500'
//                   }`}
//                 >
//                   {asset.price_change_percentage_24h >= 0 ? (
//                     <ArrowUpRight size={12} />
//                   ) : (
//                     <ArrowDownRight size={12} />
//                   )}
//                   {asset.price_change_percentage_24h.toFixed(2)}%
//                 </div>
//               </>
//             )}
//           </div>
//           {/* Actions (Desktop) */}
//           <div className="hidden sm:flex justify-end gap-2">
//             {canTrade && (
//               <button onClick={handleTrade} className="btn-primary btn-sm">
//                 Trade
//               </button>
//             )}
//           </div>
//         </div>
//       </div>
//     );
//   }
// );
// AssetRow.displayName = 'AssetRow';
// const WalletAssetsSection: FC<AssetsSectionProps> = ({ title = 'My Assets' }) => {
//   const [isRefreshing, setIsRefreshing] = useState(false);
//   const navigate = useNavigate();
//   const { assets, loading, refetch } = useWalletAssets();
//   const handleTradeClick = (asset: Asset) => {
//     navigate(ROUTES.TRADING_STEALLR, {
//       state: {
//         selectedAsset: asset,
//         fromTradeButton: true,
//       },
//     });
//   };
//   const handleRefresh = async () => {
//     setIsRefreshing(true);
//     await refetch();
//     setIsRefreshing(false);
//   };
//   if (loading && assets.length === 0) {
//     return (
//       <section className="bg-secondary rounded-2xl mt-2 overflow-hidden shadow-lg flex items-center justify-center py-8">
//         <Loader2 className="h-6 w-6 animate-spin text-primary" />
//       </section>
//     );
//   }
//   if (assets.length === 0) {
//     return (
//       <section className="bg-secondary rounded-2xl mt-2 overflow-hidden shadow-lg text-center py-8">
//         <p className="text-muted">No assets found. Connect a wallet to view your portfolio.</p>
//       </section>
//     );
//   }
//   return (
//     <>
//       <style>{`
//         @keyframes shimmer {
//           100% {
//             transform: translateX(100%);
//           }
//         }
//       `}</style>
//       <section className="bg-secondary lg:rounded-2xl mt-1 lg:mt-2 overflow-hidden shadow-lg">
//         {title && (
//           <div className="px-4 py-2 flex items-center justify-between">
//             <h2 className="text-xl font-semibold text-primary">{title}</h2>
//             <button
//               onClick={handleRefresh}
//               disabled={isRefreshing}
//               className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg transition-colors disabled:opacity-50"
//               title="Refresh balances"
//               aria-label="Refresh balances"
//             >
//               <RefreshCw
//                 size={18}
//                 className={`text-gray-500 ${isRefreshing ? 'animate-spin' : ''}`}
//               />
//             </button>
//           </div>
//         )}
//         <div className="overflow-hidden">
//           {/* Table Header */}
//           <div className="grid grid-cols-4 sm:grid-cols-5 gap-3 px-4 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wide bg-black/5 dark:bg-white/5">
//             <div>Asset</div>
//             <div>Balance</div>
//             <div className="text-center">High / Low</div>
//             <div className="text-right">Value</div>
//             <div className="hidden sm:block text-right">Actions</div>
//           </div>
//           {/* Asset Rows */}
//           {assets.map((asset, index) => (
//             <AssetRow
//               key={asset.id}
//               asset={asset}
//               isLast={index === assets.length - 1}
//               onTradeClick={handleTradeClick}
//             />
//           ))}
//         </div>
//       </section>
//     </>
//   );
// };
// export default memo(WalletAssetsSection);
import { Wallet } from 'lucide-react';
import { memo } from 'react';

import { type Asset, useWalletAssets } from '../hooks/useWalletAssets';
import { useWalletStore } from '../store/walletConnectStore';

const Shimmer = ({ className = 'h-4 w-16' }) => (
  <div className={`${className} bg-gray-200 dark:bg-gray-800 animate-pulse rounded-md`} />
);

const AssetRow = memo(({ asset }: { asset: Asset }) => {
  const isPriceLoading = asset.current_price === 0;
  const usdValue = (asset.balance || 0) * (asset.current_price || 0);

  return (
    <div className="px-4 py-4 hover:bg-black/2 dark:hover:bg-white/2 transition-colors">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="relative shrink-0">
            <img
              src={asset.image}
              className="w-12 h-12 rounded-full border border-gray-200 dark:border-gray-800 bg-white"
              alt=""
            />
            <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-yellow-500 rounded-full flex items-center justify-center border-2 border-gray-900">
              <span className="text-[8px] font-bold text-gray-900">{asset.chainName[0]}</span>
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="font-bold text-base text-white">{asset.symbol}</span>
              <span className="text-xs text-gray-400 truncate">{asset.chainName}</span>
            </div>
            <div className="flex items-baseline gap-2 mt-0.5">
              {isPriceLoading ? (
                <Shimmer className="h-3 w-16" />
              ) : (
                <>
                  <span className="text-sm text-white font-medium">
                    ${asset.current_price?.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </span>
                  {asset.price_change_percentage_24h !== 0 && (
                    <span
                      className={`text-xs font-medium ${asset.price_change_percentage_24h >= 0 ? 'text-green-500' : 'text-red-500'}`}
                    >
                      {asset.price_change_percentage_24h >= 0 ? '+' : ''}
                      {asset.price_change_percentage_24h?.toFixed(2)}%
                    </span>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        <div className="text-right shrink-0">
          <div className="text-base font-semibold text-white">
            {asset.balance?.toLocaleString(undefined, { maximumFractionDigits: 6 })}
          </div>
          <div className="text-sm text-gray-400 mt-0.5">
            {isPriceLoading ? (
              <Shimmer className="h-3 w-16 ml-auto" />
            ) : (
              `${usdValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

const WalletAssetsSection = () => {
  const { network } = useWalletStore();
  const { assets, loading, totalValue } = useWalletAssets(network);

  const hasLoadingPrices = assets.some(a => a.current_price === 0);

  return (
    <section className="bg-secondary lg:rounded-3xl mt-1 lg:mt-3 overflow-hidden border border-gray-800 shadow-2xl">
      <div className="px-4 py-6 lg:px-8 lg:py-8 bg-linear-to-br from-gray-800/50 via-transparent to-transparent flex justify-between items-center border-b border-gray-800">
        <div>
          <div className="flex items-center gap-2 text-gray-400 mb-2">
            <Wallet size={16} className="text-gray-500" />
            <span className="text-xs font-bold uppercase tracking-wider">Portfolio</span>
          </div>
          <div className="text-3xl lg:text-4xl font-bold text-white">
            {hasLoadingPrices ? (
              <Shimmer className="h-10 w-40" />
            ) : (
              `$${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
            )}
          </div>
        </div>
      </div>

      <div className="divide-y divide-gray-800">
        {assets.length === 0 && !loading ? (
          <div className="px-6 py-12 text-center text-gray-500">
            <Wallet size={48} className="mx-auto mb-4 opacity-20" />
            <p className="text-sm">No assets found in connected wallets</p>
          </div>
        ) : (
          assets.map(asset => <AssetRow key={asset.id} asset={asset} />)
        )}
      </div>
    </section>
  );
};

export default memo(WalletAssetsSection);
