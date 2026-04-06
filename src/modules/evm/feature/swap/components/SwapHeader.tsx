import React from 'react';
import { Loader2 } from 'lucide-react';
import type { ChainConfig } from '../../../utils/Chainregistry';

interface SwapHeaderProps {
  chains: ChainConfig[];
  selectedChainId: number;
  onChainSelect: (chainId: number) => void;
  isChainSwitching: boolean;
  currentNetworkChainId?: number | null;
}

export const SwapHeader: React.FC<SwapHeaderProps> = ({
  chains,
  selectedChainId,
  onChainSelect,
  isChainSwitching,
  // currentNetworkChainId,
}) => {
  return (
    <div className="card prelative overflow-hidden">
      {isChainSwitching && (
        <div className="absolute inset-0 bg-secondary/80 backdrop-blur-sm z-20 flex items-center justify-center rounded-lg">
          <div className="flex items-center gap-2 text-primary font-medium">
            <Loader2 className="w-5 h-5 animate-spin text-brand" />
            Switching Chain...
          </div>
        </div>
      )}

      <div className="flex flex-col items-center gap-4">
        <div className="flex overflow-x-auto items-center justify-start gap-4 w-full">
          {chains.map(chain => {
            const isSelected = selectedChainId === chain.chainId;
            return (
              <div key={chain.chainId} className="flex flex-col items-center gap-2">
                <button
                  onClick={() => onChainSelect(chain.chainId)}
                  disabled={isChainSwitching}
                  title={`Switch to ${chain.name}`}
                  className={`w-14 h-14 rounded-full transition-all duration-300 border-2 flex items-center justify-center ${isSelected
                    ? 'bg-brand/10 border-brand shadow-lg '
                    : 'bg-secondary border-color hover:border-brand/40 hover:bg-tertiary'
                    }`}
                >
                  <img
                    src={chain.logoURI}
                    alt={chain.name}
                    className={`w-10 h-10 rounded-full bg-white shadow-sm ring-1 ${isSelected ? 'ring-brand' : 'ring-transparent'
                      }`}
                    onError={e => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </button>
                <span
                  className={`text-[11px] font-bold uppercase tracking-tight ${isSelected ? 'text-brand' : 'text-secondary-light opacity-70'
                    }`}
                >
                  {chain.name}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* {currentNetworkChainId && currentNetworkChainId !== selectedChainId && (
        <p className="text-xs font-medium text-primary">
          Wallet on different network. Will switch when you swap.
        </p>
      )} */}
    </div>
  );
};
