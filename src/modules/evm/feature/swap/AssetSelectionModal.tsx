import { ChevronRight, Search, X } from 'lucide-react';
import React, { useEffect, useState } from 'react';

import type { TokenInfo } from '../../service/tokenListService';

interface AssetSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  assets: TokenInfo[];
  onSelect: (asset: TokenInfo) => void;
  selectedAssetSymbol?: string;
  isLoading?: boolean;
}

const AssetSelectionModal: React.FC<AssetSelectionModalProps> = ({
  isOpen,
  onClose,
  title,
  assets,
  onSelect,
  selectedAssetSymbol,
  isLoading,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isVisible, setIsVisible] = useState(false);
  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      document.body.style.overflow = 'hidden';
    } else {
      const timer = setTimeout(() => setIsVisible(false), 300);
      document.body.style.overflow = 'unset';
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const filteredAssets = assets.filter(
    asset =>
      asset.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
      asset.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      asset.address.toLowerCase() === searchQuery.toLowerCase()
  );

  if (!isVisible && !isOpen) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end sm:items-stretch sm:justify-start transition-opacity duration-300 ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
    >
      <div
        className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
      />

      <div
        className={`
                    relative w-full sm:w-105 bg-secondary shadow-2xl flex flex-col 
                    border-t sm:border-r border-color
                    rounded-t-3xl sm:rounded-none sm:rounded-r-2xl 
                    max-h-[85vh] sm:max-h-full h-full
                    transform transition-transform duration-300 ease-out
                    ${
                      isOpen
                        ? 'translate-y-0 sm:translate-y-0 sm:translate-x-0'
                        : 'translate-y-full sm:translate-y-0 sm:-translate-x-full'
                    }
                `}
      >
        <div className="w-12 h-1.5 bg-tertiary rounded-full mx-auto mt-3 mb-1 sm:hidden shrink-0" />
        <div className="flex items-center justify-between px-6 py-5 border-b border-color shrink-0">
          <h3 className="text-xl font-bold text-primary">{title}</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-tertiary hover:bg-tertiary/80 flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5 text-secondary" />
          </button>
        </div>

        <div className="px-6 py-4 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <input
              type="text"
              placeholder="Search name or paste address"
              className="w-full bg-tertiary border border-color rounded-xl py-3 pl-10 pr-4 text-sm text-primary placeholder:text-muted focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-all"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              autoFocus={isOpen}
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-6 scrollbar-thin scrollbar-thumb-tertiary scrollbar-track-transparent">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted space-y-3">
              <div className="w-8 h-8 rounded-full border-2 border-brand border-t-transparent animate-spin" />
              <p className="text-sm font-medium">Loading tokens...</p>
            </div>
          ) : filteredAssets.length === 0 ? (
            <div className="py-12 text-center text-muted">
              <p className="font-medium">No tokens found</p>
              <p className="text-xs mt-1">Try a different search term</p>
            </div>
          ) : (
            <div className="space-y-1">
              <div className="px-3 py-2 text-xs font-semibold text-muted uppercase tracking-wider sticky top-0 bg-secondary backdrop-blur-sm z-10">
                Popular Tokens
              </div>
              {filteredAssets.map(asset => (
                <button
                  key={`${asset.chainId}-${asset.address}`}
                  onClick={() => {
                    onSelect(asset);
                    setSearchQuery('');
                  }}
                  className={`w-full flex items-center justify-between p-3 rounded-xl transition-all group ${
                    selectedAssetSymbol === asset.symbol
                      ? 'bg-brand/10 border border-brand/20'
                      : 'hover:bg-tertiary/50 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      {asset.logoURI ? (
                        <img
                          src={asset.logoURI}
                          alt={asset.symbol}
                          className="w-10 h-10 rounded-full object-cover bg-white shadow-sm group-hover:scale-105 transition-transform"
                          onError={e => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-brand/10 flex items-center justify-center text-brand font-bold text-xs group-hover:scale-105 transition-transform">
                          {asset.symbol.slice(0, 2)}
                        </div>
                      )}

                      {selectedAssetSymbol === asset.symbol && (
                        <div className="absolute -bottom-0.5 -right-16 bg-brand rounded-full p-0.5 border-2 border-green-600">
                          <svg
                            className="w-2 h-2 text-green-600"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={3}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        </div>
                      )}
                    </div>

                    <div className="text-left">
                      <div className="font-bold text-primary flex items-center gap-2">
                        {asset.symbol}
                        {asset.isNative && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-bold bg-brand/10 text-brand border border-brand/20">
                            Native
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-secondary font-medium truncate max-w-[180px]">
                        {asset.name}
                      </div>
                    </div>
                  </div>

                  <div
                    className={`text-muted opacity-0 -translate-x-2 transition-all duration-200 ${selectedAssetSymbol === asset.symbol ? 'opacity-100 translate-x-0 text-brand' : 'group-hover:opacity-100 group-hover:translate-x-0'}`}
                  >
                    <ChevronRight className="w-5 h-5" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AssetSelectionModal;
