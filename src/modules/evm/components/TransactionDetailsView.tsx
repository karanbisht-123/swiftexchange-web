import { ArrowDownLeft, Check, Copy, ExternalLink } from 'lucide-react';
import React, { useState } from 'react';

import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import { type TransactionItem } from '../service/EvmTransactionService';
import { getChainLogoUrl, getChainName, getExplorerUrl, normalizeChainId } from '../utils/Chainregistry';

interface TransactionDetailsViewProps {
  transaction: TransactionItem;
  chainId: number;
}

const TransactionDetailsView: React.FC<TransactionDetailsViewProps> = ({ transaction, chainId }) => {
  const currentNetwork = useWalletStore(state => state.network);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const safeChainId = normalizeChainId(chainId);
  const chainSymbol = getChainName(safeChainId, currentNetwork);
  const logoUrl = getChainLogoUrl(safeChainId, currentNetwork);

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  return (
    <div className="flex flex-col h-full bg-secondary rounded-2xl overflow-hidden border border-color shadow-sm">
      <div className="bg-tertiary/30 p-6 flex flex-col items-center justify-center border-b border-color">
        <div className="w-16 h-16 rounded-full bg-tertiary flex items-center justify-center mb-4 shadow-inner">
          {logoUrl ? (
            <img src={logoUrl} alt={chainSymbol} className="w-10 h-10 rounded-full" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-brand-primary/20 flex items-center justify-center text-sm font-bold text-brand-primary">
              {chainSymbol.slice(0, 2)}
            </div>
          )}
        </div>
        <div className="text-3xl font-bold text-primary tracking-tight">
          {parseFloat(transaction.formattedAmount).toFixed(6)}{' '}
          <span className="text-lg text-muted font-medium">{transaction.asset}</span>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${transaction?.formattedAmount?.startsWith('-') ? 'bg-red-500/10 text-red-500' : 'bg-green-500/10 text-green-500'}`}>
            Success
          </span>
          <span className="text-xs text-muted font-medium bg-tertiary px-2 py-0.5 rounded-full">
            {transaction.category}
          </span>
        </div>
      </div>

      <div className="p-6 space-y-6 overflow-y-auto flex-1">
        <div className="space-y-4">
          <h4 className="text-xs font-bold text-muted uppercase tracking-wider">Transaction Info</h4>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-secondary">Tx Hash</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-mono text-primary truncate max-w-[120px] md:max-w-[200px]" title={transaction.hash}>
                  {transaction.hash.slice(0, 6)}...{transaction.hash.slice(-4)}
                </span>
                <button onClick={() => handleCopy(transaction.hash, 'hash')} className="p-1.5 hover:bg-tertiary rounded-md text-muted hover:text-primary transition-colors">
                  {copiedField === 'hash' ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                </button>
                <a href={getExplorerUrl(safeChainId, currentNetwork, 'tx', transaction.hash)} target="_blank" rel="noopener noreferrer" className="p-1.5 hover:bg-tertiary rounded-md text-muted hover:text-primary transition-colors">
                  <ExternalLink size={14} />
                </a>
              </div>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-sm text-secondary">Block</span>
              <a
                href={getExplorerUrl(safeChainId, currentNetwork, 'block', String(parseInt(transaction.blockNum, 16)))}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-mono text-brand-primary hover:underline flex items-center gap-1"
              >
                {parseInt(transaction.blockNum, 16)}
                <ExternalLink size={10} />
              </a>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-sm text-secondary">Status</span>
              <div className="flex items-center gap-1.5 text-green-500 text-sm font-medium">
                <Check size={14} /> Confirmed
              </div>
            </div>
          </div>
        </div>

        <div className="h-px bg-color w-full" />

        <div className="space-y-4">
          <h4 className="text-xs font-bold text-muted uppercase tracking-wider">Transfer Details</h4>
          <div className="bg-tertiary/50 p-3 rounded-xl space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted font-semibold uppercase">From</span>
              <button onClick={() => handleCopy(transaction.from, 'from')} className="p-1 hover:bg-hover rounded text-muted hover:text-primary transition-colors">
                {copiedField === 'from' ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
              </button>
            </div>
            <div className="font-mono text-sm text-primary break-all">{transaction.from}</div>
          </div>

          <div className="flex justify-center -my-2 relative z-10">
            <div className="bg-secondary p-1 rounded-full border border-color text-muted">
              <ArrowDownLeft size={16} />
            </div>
          </div>

          <div className="bg-tertiary/50 p-3 rounded-xl space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted font-semibold uppercase">To</span>
              <button onClick={() => handleCopy(transaction.to, 'to')} className="p-1 hover:bg-hover rounded text-muted hover:text-primary transition-colors">
                {copiedField === 'to' ? <Check size={12} className="text-green-500" /> : <Copy size={12} />}
              </button>
            </div>
            <div className="font-mono text-sm text-primary break-all">{transaction.to}</div>
          </div>
        </div>

        <div className="h-px bg-color w-full" />

        <div className="space-y-4">
          <h4 className="text-xs font-bold text-muted uppercase tracking-wider">Gas & Protocol</h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-tertiary/30 p-3 rounded-lg">
              <span className="text-xs text-muted block mb-1">Raw Value</span>
              <span className="text-sm font-mono text-primary truncate block" title={transaction.rawContract.value}>
                {transaction.rawContract.value}
              </span>
            </div>
            <div className="bg-tertiary/30 p-3 rounded-lg">
              <span className="text-xs text-muted block mb-1">Gas Limit</span>
              <span className="text-sm font-mono text-primary">21000</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TransactionDetailsView;