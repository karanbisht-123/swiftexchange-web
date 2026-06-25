import { AlertCircle, ChevronDown, Info } from 'lucide-react';
import { useState } from 'react';

import type { SwapQuote, TokenInfo, TokenPlaceholder } from '../../types/ammSwap.types';

import { getTokenIcon } from '../../../evm/utils/ChainUrlHelpers';
import { getChainById } from '../../../evm/utils/Chainregistry';
import { useWalletStore } from '../../../walletconnect/store/walletConnectStore';

interface TokenSelectorProps {
  selectedToken: TokenInfo | TokenPlaceholder;
  onSelect: (token: TokenInfo) => void;
  tokens: TokenInfo[];
  label?: string;
}

export const TokenSelector = ({ selectedToken, onSelect, tokens }: TokenSelectorProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const network = useWalletStore(state => state.network);
  const chainId = network === 'mainnet' ? 'pubnet' : 'testnet';
  const chainConfig = getChainById(chainId);

  const tokenIcon = getTokenIcon(selectedToken.code, chainConfig, 'issuer' in selectedToken ? selectedToken.issuer : undefined);

  return (
    <div className="relative ">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-5 rounded-lg bg-primary hover:bg-hover transition-colors min-w-[120px]"
      >
        {tokenIcon ? (
          <img
            src={tokenIcon}
            alt={selectedToken.code}
            className="w-5 h-5 rounded-full"
            onError={e => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <div className="w-5 h-5 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-[10px] font-bold text-white">
            {selectedToken.code[0]}
          </div>
        )}
        <span className="font-semibold text-sm text-primary">{selectedToken.code}</span>
        <ChevronDown
          className={`w-4 h-4 text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-50 bg-secondary rounded-lg border border-color py-1 min-w-[180px] max-h-[300px] overflow-y-auto">
            {tokens.map(token => {
              const icon = getTokenIcon(token.code, chainConfig, token.issuer);
              const isSelected = selectedToken.code === token.code;

              return (
                <button
                  key={`${token.code}-${token.issuer || 'native'}`}
                  onClick={() => {
                    onSelect(token);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 hover:bg-hover transition-colors ${isSelected ? 'bg-hover' : ''
                    }`}
                >
                  {icon ? (
                    <img
                      src={icon}
                      alt={token.code}
                      className="w-6 h-6 rounded-full"
                      onError={e => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white">
                      {token.code[0]}
                    </div>
                  )}

                  <div className="flex-1 text-left">
                    <div className="font-semibold text-sm text-primary">{token.code}</div>
                    {token.balance && (
                      <div className="text-xs text-muted">
                        {parseFloat(token.balance).toFixed(4)}
                      </div>
                    )}
                  </div>

                  {isSelected && <div className="w-2 h-2 rounded-full bg-green-500" />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

interface SettingsPanelProps {
  slippage: number;
  onSlippageChange: (slippage: number) => void;
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsPanel = ({
  slippage,
  onSlippageChange,
  isOpen,
  onClose,
}: SettingsPanelProps) => {
  const presets = [0.1, 0.5, 1, 2, 5];
  const [custom, setCustom] = useState('');

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-bg-overlay z-20" onClick={onClose} />
      <div className="absolute card right-0 top-14 z-30 w-80 bg-secondary rounded-xl border border-color p-4 animate-slide-up">
        <h3 className="heading-3 mb-4">Transaction Settings</h3>

        <div className="mb-4">
          <label className="text-small text-muted mb-2 block">Slippage Tolerance</label>
          <div className="grid grid-cols-5 gap-2 mb-2">
            {presets.map(preset => (
              <button
                key={preset}
                onClick={() => {
                  onSlippageChange(preset);
                  setCustom('');
                }}
                className={`btn btn-secondary btn-sm ${slippage === preset ? 'bg-brand-primary text-text-inverse' : ''
                  }`}
              >
                {preset}%
              </button>
            ))}
          </div>
          <input
            type="number"
            placeholder="Custom"
            value={custom}
            onChange={e => {
              setCustom(e.target.value);
              const val = parseFloat(e.target.value);
              if (!isNaN(val) && val > 0) {
                onSlippageChange(val);
              }
            }}
            className="input input-primary w-full text-sm"
          />
        </div>

        {slippage > 5 && (
          <div className="flex items-start gap-2 p-3 bg-warning-light border border-warning rounded-lg animate-fade-in">
            <AlertCircle className="w-4 h-4 text-warning mt-0.5 flex-shrink-0" />
            <p className="text-xs text-warning">
              High slippage tolerance may result in unfavorable rates
            </p>
          </div>
        )}
      </div>
    </>
  );
};

interface SwapDetailsProps {
  quote: SwapQuote | null;
}

export const SwapDetails = ({ quote }: SwapDetailsProps) => {
  const [showDetails, setShowDetails] = useState(false);

  if (!quote) return null;

  const rate =
    quote.path.path[0].code === quote.path.path[1].code
      ? '1'
      : (
        parseFloat(quote.estimatedOutput) /
        parseFloat(quote.path.path[0].code === 'XLM' ? '100' : '1')
      ).toFixed(6);
  const priceImpactColor =
    quote.priceImpact > 5 ? 'price-down' : quote.priceImpact > 2 ? 'text-warning' : 'price-up';

  return (
    <div className="card card-glass p-4 space-y-3 animate-fade-in">
      <button
        onClick={() => setShowDetails(!showDetails)}
        className="w-full flex items-center justify-between text-small text-muted hover:text-text-primary transition-colors"
      >
        <span>Swap Details</span>
        <ChevronDown
          className={`w-4 h-4 transition-transform ${showDetails ? 'rotate-180' : ''}`}
        />
      </button>

      {showDetails && (
        <div className="space-y-2 pt-2 border-t border-color">
          <div className="flex justify-between text-small">
            <span className="text-muted">Rate</span>
            <span className="text-text-primary font-medium">
              1 {quote.path.path[0].code} ≈ {rate} {quote.path.path[1].code}
            </span>
          </div>

          <div className="flex justify-between text-small">
            <span className="text-muted flex items-center gap-1">
              Price Impact
              <Info className="w-3 h-3" />
            </span>
            <span className={`font-medium ${priceImpactColor}`}>
              {quote.priceImpact.toFixed(2)}%
            </span>
          </div>

          <div className="flex justify-between text-small">
            <span className="text-muted">Minimum Received</span>
            <span className="text-text-primary font-medium">
              {parseFloat(quote.minimumOutput).toFixed(4)} {quote.path.path[1].code}
            </span>
          </div>

          <div className="flex justify-between text-small">
            <span className="text-muted">Route</span>
            <span className="text-text-primary font-medium">
              {quote.path.path.map(t => t.code).join(' → ')}
            </span>
          </div>

          <div className="flex justify-between text-small">
            <span className="text-muted">Network Fee</span>
            <span className="text-text-primary font-medium">~0.00001 XLM</span>
          </div>
        </div>
      )}
    </div>
  );
};
