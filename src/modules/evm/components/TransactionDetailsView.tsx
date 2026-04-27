import { ArrowDownLeft, Check, Copy, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import React, { useState } from 'react';

import { type LocalTransactionWithStatus } from '../hook/useLocalTransactions';
import { type TransactionItem } from '../service/EvmTransactionService';
import { getChainLogoUrl, getChainName, getExplorerUrl, getGlobalAssetMetadata, getAssetByAddress } from '../utils/Chainregistry';
import { formatTxAmount, formatAssetName, getDisplayAmountWithSign } from '../utils/formatAmount';

interface TransactionDetailsViewProps {
  transaction: TransactionItem | LocalTransactionWithStatus;
  chainId: number;
  incoming?: boolean;
  isSelf?: boolean;
  onRefresh?: () => void;
}

const TransactionDetailsView: React.FC<TransactionDetailsViewProps> = ({
  transaction,
  chainId,
  incoming = false,
  isSelf = false,
  onRefresh,
}) => {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const chainSymbol = getChainName(chainId);
  const logoUrl = getChainLogoUrl(chainId);

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const isLocal = 'type' in transaction;
  const status = isLocal ? (transaction as LocalTransactionWithStatus).status : 'success';
  const type = isLocal ? (transaction as LocalTransactionWithStatus).type : 'transaction';
  const description = isLocal ? (transaction as LocalTransactionWithStatus).description : null;
  const timestamp = isLocal ? (transaction as LocalTransactionWithStatus).timestamp : null;
  const destinationHash = isLocal ? (transaction as LocalTransactionWithStatus).destinationHash : null;

  let assetLogo = undefined;
  if (!isLocal) {
    const tx = transaction as TransactionItem;
    if (tx.asset) assetLogo = getGlobalAssetMetadata(tx.asset)?.logoURI;
    if (!assetLogo && tx.rawContract?.address) assetLogo = getAssetByAddress(chainId, tx.rawContract.address)?.logoURI;
  }
  
  const displayIcon = assetLogo || logoUrl;

  const getStatusDisplay = () => {
    if (status === 'pending') {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-yellow-500/10 text-yellow-500 flex items-center gap-1">
          <Loader2 size={12} className="animate-spin" /> Pending
        </span>
      );
    }
    if (status === 'success') {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-green-500/10 text-green-500 flex items-center gap-1">
          <Check size={12} /> Success
        </span>
      );
    }
    return (
      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-red-500/10 text-red-500 flex items-center gap-1">
        Failed
      </span>
    );
  };

  const amount = isLocal ? '—' : getDisplayAmountWithSign(formatTxAmount(transaction as TransactionItem), incoming, isSelf);
  const assetName = isLocal ? '' : formatAssetName(transaction as TransactionItem);

  return (
    <div className="flex flex-col h-full bg-secondary rounded-2xl overflow-hidden border border-color shadow-sm">
      <div className="bg-tertiary/30 p-8 flex flex-col items-center justify-center border-b border-color relative">
        {isLocal && (
          <button
            onClick={onRefresh}
            className="absolute top-6 right-6 p-2.5 rounded-xl bg-tertiary hover:bg-tertiary/80 text-muted hover:text-primary transition-all active:scale-95 shadow-sm"
            title="Refresh Status"
          >
            <RefreshCw size={18} className={status === 'pending' ? 'animate-spin' : ''} />
          </button>
        )}
        <div className="w-20 h-20 rounded-full bg-tertiary flex items-center justify-center mb-6 shadow-inner border border-color overflow-hidden">
          {displayIcon ? (
            <img src={displayIcon} alt={chainSymbol} className="w-full h-full object-cover" />
          ) : (
            <div className="w-12 h-12 rounded-xl bg-brand-primary/10 flex items-center justify-center text-xl font-black text-brand-primary">
              {chainSymbol.slice(0, 2)}
            </div>
          )}
        </div>
        {!isLocal ? (
          <div className="text-3xl font-black text-primary tracking-tight mb-2">
            {amount} <span className="text-xl text-muted font-bold ml-1">{assetName}</span>
          </div>
        ) : (
          <div className="text-2xl font-black text-primary tracking-tight text-center max-w-[80%] leading-tight mb-2">
            {description || `${type.charAt(0).toUpperCase() + type.slice(1)} Transaction`}
          </div>
        )}
        <div className="flex items-center gap-3 mt-2">
          {getStatusDisplay()}
          <div className="h-1 w-1 rounded-full bg-muted/30" />
          <span className="text-xs font-bold text-muted uppercase tracking-[0.2em] bg-tertiary/50 px-3 py-1 rounded-full border border-color/30">
            {isLocal ? type : (transaction as TransactionItem).category}
          </span>
        </div>
      </div>

      <div className="p-8 space-y-8 overflow-y-auto flex-1 custom-scrollbar">
        <div className="space-y-4">
          <h4 className="text-xs font-bold text-muted uppercase tracking-wider">Transaction Info</h4>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-secondary">Tx Hash</span>
              <div className="flex items-center gap-2">
                <span
                  className="text-sm font-mono text-primary truncate max-w-[120px] md:max-w-[200px]"
                  title={transaction.hash}
                >
                  {transaction.hash.slice(0, 6)}...{transaction.hash.slice(-4)}
                </span>
                <button
                  onClick={() => handleCopy(transaction.hash, 'hash')}
                  className="p-1.5 hover:bg-tertiary rounded-md text-muted hover:text-primary transition-colors"
                >
                  {copiedField === 'hash' ? (
                    <Check size={14} className="text-primary" />
                  ) : (
                    <Copy size={14} />
                  )}
                </button>
                <a
                  href={getExplorerUrl(chainId, 'tx', transaction.hash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 hover:bg-tertiary rounded-md text-muted hover:text-primary transition-colors"
                >
                  <ExternalLink size={14} />
                </a>
              </div>
            </div>

            {destinationHash && (
              <div className="flex justify-between items-center transition-all animate-in fade-in slide-in-from-top-1">
                <span className="text-sm text-secondary">Dest. Hash</span>
                <div className="flex items-center gap-2">
                  <span
                    className="text-sm font-mono text-green-500 truncate max-w-[120px] md:max-w-[200px]"
                    title={destinationHash}
                  >
                    {destinationHash.slice(0, 6)}...{destinationHash.slice(-4)}
                  </span>
                  <button
                    onClick={() => handleCopy(destinationHash, 'dest_hash')}
                    className="p-1.5 hover:bg-tertiary rounded-md text-muted hover:text-primary transition-colors"
                  >
                    {copiedField === 'dest_hash' ? (
                      <Check size={14} className="text-primary" />
                    ) : (
                      <Copy size={14} />
                    )}
                  </button>
                </div>
              </div>
            )}

            {!isLocal && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-secondary">Block</span>
                <a
                  href={getExplorerUrl(
                    chainId,
                    'block',
                    String(parseInt((transaction as TransactionItem).blockNum, 16))
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-mono text-brand-primary hover:underline flex items-center gap-1"
                >
                  {parseInt((transaction as TransactionItem).blockNum, 16)}
                  <ExternalLink size={10} />
                </a>
              </div>
            )}

            <div className="flex justify-between items-center">
              <span className="text-sm text-secondary">Time</span>
              <span className="text-sm text-primary font-medium">
                {timestamp ? new Date(timestamp).toLocaleString() : 'Just now'}
              </span>
            </div>
          </div>
        </div>

        <div className="h-px bg-color w-full" />

        {((!isLocal) || (isLocal && type === 'bridge')) && (
          <>
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-muted uppercase tracking-wider">
                Transfer Details
              </h4>
              <div className="bg-tertiary/50 p-3 rounded-xl space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted font-semibold uppercase">From</span>
                  <button
                    onClick={() => handleCopy(isLocal ? (transaction as LocalTransactionWithStatus).from || '' : (transaction as TransactionItem).from, 'from')}
                    className="p-1 hover:bg-hover rounded text-muted hover:text-primary transition-colors"
                  >
                    {copiedField === 'from' ? (
                      <Check size={12} className="text-primary" />
                    ) : (
                      <Copy size={12} />
                    )}
                  </button>
                </div>
                <div className="font-mono text-sm text-primary break-all">
                  {isLocal ? (transaction as LocalTransactionWithStatus).from || '—' : (transaction as TransactionItem).from}
                </div>
              </div>

              <div className="flex justify-center -my-2 relative z-10">
                <div className="bg-secondary p-1 rounded-full border border-color text-muted">
                  <ArrowDownLeft size={16} />
                </div>
              </div>

              <div className="bg-tertiary/50 p-3 rounded-xl space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted font-semibold uppercase">Recipient (To)</span>
                  <button
                    onClick={() => handleCopy(isLocal ? (transaction as LocalTransactionWithStatus).to || '' : (transaction as TransactionItem).to, 'to')}
                    className="p-1 hover:bg-hover rounded text-muted hover:text-primary transition-colors"
                  >
                    {copiedField === 'to' ? (
                      <Check size={12} className="text-primary" />
                    ) : (
                      <Copy size={12} />
                    )}
                  </button>
                </div>
                <div className="font-mono text-sm text-primary break-all">
                  {isLocal ? (transaction as LocalTransactionWithStatus).to || '—' : (transaction as TransactionItem).to}
                </div>
              </div>
            </div>
            <div className="h-px bg-color w-full" />
          </>
        )}

        <div className="space-y-4">
          <h4 className="text-xs font-bold text-muted uppercase tracking-wider">Gas & Protocol</h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-tertiary/30 p-3 rounded-lg">
              <span className="text-xs text-muted block mb-1">Network</span>
              <span className="text-sm font-semibold text-primary">{chainSymbol}</span>
            </div>
            <div className="bg-tertiary/30 p-3 rounded-lg">
              <span className="text-xs text-muted block mb-1">Type</span>
              <span className="text-sm font-semibold text-primary capitalize">{type}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TransactionDetailsView;