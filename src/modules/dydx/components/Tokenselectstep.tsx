import { ChevronLeft, Search, SearchX } from 'lucide-react';
import React from 'react';
import { getChainById, getChainLogoUrl } from '../../evm/utils/Chainregistry';
import { type Asset } from '../../walletconnect/store/portfolioStore';
import {
    isStellarAsset,
    needsSwapToUsdc
} from '../utils/Depositassetutils';


const AssetRow: React.FC<{
    asset: Asset;
    onSelect: (asset: Asset) => void;
}> = ({ asset, onSelect }) => {
    const chainConfig = getChainById(asset.chainId || 0);
    const chainIconUrl = asset.chainId ? getChainLogoUrl(asset.chainId) : undefined;
    const usdValue = (asset.balance || 0) * (asset.current_price || 0);
    const stellar = isStellarAsset(asset);
    const swapNeeded = !stellar && needsSwapToUsdc(asset);

    return (
        <button
            onClick={() => onSelect(asset)}
            className="group flex w-full items-center justify-between px-4 py-3 rounded-2xl hover:bg-hover transition-all text-left"
        >
            <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="relative shrink-0">
                    <img
                        src={asset.image || chainConfig?.logoURI}
                        alt=""
                        className="w-9 h-9 rounded-full bg-hover object-cover"
                    />
                    {chainIconUrl && (
                        <img
                            src={chainIconUrl}
                            alt=""
                            className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-secondary"
                        />
                    )}
                </div>
                <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[14px] font-bold text-primary">{asset.symbol}</span>
                        {asset.isNative && (
                            <span className="text-[9px] bg-brand/10 text-brand px-1.5 py-0.5 rounded-md font-black uppercase tracking-wide">
                                Native
                            </span>
                        )}
                        {stellar && (
                            <span className="text-[9px] bg-amber-500/15 text-amber-400 px-1.5 py-0.5 rounded-md font-black uppercase tracking-wide">
                                Bridge first
                            </span>
                        )}
                        {swapNeeded && (
                            <span className="text-[9px] bg-brand/10 text-brand/80 px-1.5 py-0.5 rounded-md font-black uppercase tracking-wide">
                                Swap first
                            </span>
                        )}
                    </div>
                    <div className="text-[11px] text-muted truncate">
                        {asset.chainName || asset.name || asset.symbol}
                    </div>
                </div>
            </div>
            <div className="text-right ml-3 shrink-0">
                <div className="text-[13px] font-bold text-primary">
                    {asset.balance?.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                </div>
                <div className="text-[11px] text-muted">
                    ${usdValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
            </div>
        </button>
    );
};

interface TokenSelectStepProps {
    priorityAssets: Asset[];
    otherAssets: Asset[];
    searchQuery: string;
    onSearchChange: (q: string) => void;
    onSelectAsset: (asset: Asset) => void;
    onBack: () => void;
}

export const TokenSelectStep: React.FC<TokenSelectStepProps> = ({
    priorityAssets,
    otherAssets,
    searchQuery,
    onSearchChange,
    onSelectAsset,
    onBack,
}) => {
    const isEmpty = priorityAssets.length === 0 && otherAssets.length === 0;

    return (
        <>
            {/* Header */}
            <div className="flex items-center gap-3 px-5 pt-5 pb-3 shrink-0 border-b border-color">
                <button
                    onClick={onBack}
                    className="p-1.5 -ml-1 text-muted hover:text-primary transition-colors rounded-lg hover:bg-hover"
                >
                    <ChevronLeft className="w-5 h-5" />
                </button>
                <h3 className="text-lg font-semibold text-primary">Select token</h3>
            </div>

            {/* Search */}
            <div className="px-5 pt-3 pb-3 border-b border-color">
                <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" size={16} />
                    <input
                        type="text"
                        placeholder="Search tokens"
                        className="w-full bg-secondary border border-color pl-11 pr-4 py-2.5 rounded-xl text-sm focus:ring-1 focus:ring-brand/20 transition-all text-primary"
                        value={searchQuery}
                        onChange={e => onSearchChange(e.target.value)}
                    />
                </div>
            </div>

            {/* Asset list */}
            <div className="flex-1 overflow-y-auto px-2 pb-4">
                {isEmpty ? (
                    <div className="flex flex-col items-center justify-center h-full text-center px-10 py-12">
                        <div className="w-16 h-16 bg-tertiary rounded-full flex items-center justify-center mb-4">
                            <SearchX size={32} className="text-muted opacity-25" />
                        </div>
                        <h3 className="text-base font-bold text-primary mb-1">No assets found</h3>
                        <p className="text-sm text-muted leading-relaxed">
                            {searchQuery
                                ? `No results for "${searchQuery}".`
                                : 'No assets with balance on this network.'}
                        </p>
                        {searchQuery && (
                            <button
                                onClick={() => onSearchChange('')}
                                className="mt-4 text-brand font-bold text-xs uppercase tracking-widest hover:underline"
                            >
                                Clear search
                            </button>
                        )}
                    </div>
                ) : (
                    <>
                        {priorityAssets.map(asset => (
                            <AssetRow
                                key={`${asset.chainId}-${asset.symbol}-${asset.address}`}
                                asset={asset}
                                onSelect={onSelectAsset}
                            />
                        ))}
                        {otherAssets.length > 0 && (
                            <>
                                <div className="px-4 pt-4 pb-2">
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted/60">
                                        Other tokens
                                    </span>
                                </div>
                                {otherAssets.map(asset => (
                                    <AssetRow
                                        key={`${asset.chainId}-${asset.symbol}-${asset.address}`}
                                        asset={asset}
                                        onSelect={onSelectAsset}
                                    />
                                ))}
                            </>
                        )}
                    </>
                )}
            </div>
        </>
    );
};