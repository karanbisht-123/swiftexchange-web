import { Search, X, CheckCircle2 } from 'lucide-react';
import React, { useState, useMemo } from 'react';
import type { TokenInfo } from '../../types/ammSwap.types';
import { portfolioUtils } from '../../../walletconnect/utils/portfolioUtils';
import { getTokenIcon } from '../../../evm/utils/ChainUrlHelpers';
import { getChainById } from '../../../evm/utils/Chainregistry';
import { useWalletStore } from '../../../walletconnect/store/walletConnectStore';

interface StellarAssetSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  tokens: TokenInfo[];
  selectedToken: TokenInfo | null;
  onSelect: (token: TokenInfo) => void;
  title?: string;
}

const StellarAssetSelectorModal: React.FC<StellarAssetSelectorModalProps> = ({
  isOpen,
  onClose,
  tokens,
  selectedToken,
  onSelect,
  title = 'Select Asset'
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const network = useWalletStore((state: any) => state.network);
  const stellarChainId = network === 'mainnet' ? 'pubnet' : 'testnet';
  const chainConfig = getChainById(stellarChainId);

  const filteredTokens = useMemo(() => {
    return tokens
      .filter(token => 
        token.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (token.issuer && token.issuer.toLowerCase().includes(searchQuery.toLowerCase()))
      )
      .sort((a, b) => {
        const balanceA = parseFloat(a.balance || '0');
        const balanceB = parseFloat(b.balance || '0');
        return balanceB - balanceA;
      });
  }, [tokens, searchQuery]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" 
        onClick={onClose} 
      />
      
      <div className="relative w-full max-w-md bg-secondary rounded-3xl shadow-2xl border border-divider overflow-hidden animate-scale-in">
        <div className="p-4 border-b border-divider flex items-center justify-between">
          <h3 className="text-lg font-black uppercase tracking-wider text-primary">{title}</h3>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-hover rounded-full transition-colors text-muted"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-4">
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={18} />
            <input
              type="text"
              placeholder="Search by symbol or issuer address"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-tertiary border border-divider rounded-2xl py-3 pl-10 pr-4 text-sm focus:outline-none focus:border-brand transition-all placeholder:text-muted/50"
            />
          </div>

          <div className="max-h-[400px] overflow-y-auto no-scrollbar space-y-1">
            {filteredTokens.length === 0 ? (
              <div className="text-center py-8 text-muted">
                <p className="text-sm font-bold uppercase tracking-widest">No assets found</p>
              </div>
            ) : (
            filteredTokens.map((token: any) => {
                const isSelected = selectedToken?.code === token.code && selectedToken?.issuer === token.issuer;
                const icon = token.icon || getTokenIcon(token.code, chainConfig, token.issuer);
                
                return (
                  <button
                    key={`${token.code}-${token.issuer || 'native'}`}
                    onClick={() => {
                      onSelect(token);
                      onClose();
                    }}
                    className={`w-full flex items-center justify-between p-3 rounded-2xl transition-all group ${
                      isSelected ? 'bg-brand/10 border border-brand/20' : 'hover:bg-hover border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative w-10 h-10 rounded-full bg-tertiary flex items-center justify-center overflow-hidden border border-divider/50 shadow-sm">
                        <img 
                          src={icon || `https://ui-avatars.com/api/?name=${token.code}&background=random`} 
                          alt={token.code}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${token.code}&background=random`;
                          }}
                        />
                      </div>
                      <div className="text-left">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-[14px] text-primary">{token.code}</span>
                          {isSelected && <CheckCircle2 size={14} className="text-brand" />}
                        </div>
                        <div className="text-[10px] text-muted font-bold truncate max-w-[185px] normal-case">
                          {token.asset.isNative()
                            ? 'stellar.org'
                            : (token.homeDomain || token.domain
                                ? `${token.name || token.code} (${token.homeDomain || token.domain})`
                                : (token.name || (token.issuer?.slice(0, 8) + '...' + token.issuer?.slice(-8)))
                              )
                          }
                        </div>
                      </div>
                    </div>
                    
                    <div className="text-right">
                      <div className="text-[12px] font-black text-primary">
                        {portfolioUtils.formatBalance(token.balance || '0')}
                      </div>
                      <div className="text-[10px] text-muted font-bold">Balance</div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className="p-4 bg-tertiary border-t border-divider text-center">
          <p className="text-[10px] text-muted font-bold uppercase tracking-widest opacity-60">
            Secure Asset Selection | Stellar network
          </p>
        </div>
      </div>
    </div>
  );
};

export default StellarAssetSelectorModal;
