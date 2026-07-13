import {
  ArrowDown,
  ArrowDownLeft,
  Check,
  Copy,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';
import React, { useEffect, useState } from 'react';

import { type LocalTransactionWithStatus } from '../hook/useLocalTransactions';
import { type TransactionItem } from '../service/EvmTransactionService';
import {
  type FusionOrderStatusResponse,
  getFusionOrderStatus,
} from '../service/evmTransactionStatusService';
import {
  getAssetByAddress,
  getChainLogoUrl,
  getChainName,
  getExplorerUrl,
  getGlobalAssetMetadata,
} from '../utils/Chainregistry';
import { formatAssetName, formatTxAmount, getDisplayAmountWithSign } from '../utils/formatAmount';

interface TransactionDetailsViewProps {
  transaction: TransactionItem | LocalTransactionWithStatus;
  chainId: number | string;
  incoming?: boolean;
  isSelf?: boolean;
  onRefresh?: () => void;
  backendStatus?: any;
  onClose?: () => void;
}

const TransactionDetailsView: React.FC<TransactionDetailsViewProps> = ({
  transaction,
  chainId,
  incoming = false,
  isSelf = false,
  onRefresh,
  backendStatus,
  onClose,
}) => {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [fusionDetails, setFusionDetails] = useState<FusionOrderStatusResponse | null>(null);

  const chainSymbol = getChainName(chainId);
  const logoUrl = getChainLogoUrl(chainId);

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const txProvider = (transaction as any).provider;
  const isFusion = txProvider === 'ONEINCH_FUSION' || txProvider === 'ONEINCH_FUSION_PLUS';
  const isAllbridge = txProvider === 'ALLBRIDGE' || txProvider === 'SRBTODYDX';

  const isLocal = 'type' in transaction;
  const isBackendOrder = (transaction as any).isBackendOrder;

  const rawStatus =
    isFusion && fusionDetails?.status
      ? fusionDetails.status
      : backendStatus?.status ||
        (isLocal ? (transaction as LocalTransactionWithStatus).status : 'success');

  const getStatusType = (s: string | undefined): 'success' | 'failed' | 'pending' => {
    if (!s) return 'pending';
    const lower = s.toLowerCase();
    if (
      lower === 'completed' ||
      lower === 'executed' ||
      lower === 'success' ||
      lower === 'filled'
    ) {
      return 'success';
    }
    if (
      lower === 'failed' ||
      lower === 'cancelled' ||
      lower === 'expired' ||
      lower === 'invalid' ||
      lower === 'refunded'
    ) {
      return 'failed';
    }
    return 'pending'; // created, pending, partially_filled, refunding, etc.
  };
  const status = getStatusType(rawStatus);
  const type = isLocal ? (transaction as LocalTransactionWithStatus).type : 'transaction';
  const description = isLocal ? (transaction as LocalTransactionWithStatus).description : null;

  const cleanLabel = (desc: string | null | undefined, defaultType: string) => {
    if (!desc) return `${defaultType.charAt(0).toUpperCase() + defaultType.slice(1)} Transaction`;
    return desc.replace(/\s*\(Step \d+\/\d+\)/i, '').replace(/\s*for Swap/i, '');
  };

  const displayType = isLocal ? (description ? cleanLabel(description, type) : type) : type;

  useEffect(() => {
    if (isFusion && transaction.hash) {
      const chain = (transaction as any).fromChainSymbol || getChainName(chainId) || 'ETH';
      getFusionOrderStatus(chain, transaction.hash, txProvider)
        .then(res => setFusionDetails(res))
        .catch(err => console.error('Failed to load Fusion order details:', err));
    }
  }, [isFusion, transaction, chainId, txProvider]);

  let displayHash = transaction.hash;
  let showExplorerLink = true;

  if (isFusion) {
    if (fusionDetails?.fills && fusionDetails.fills.length > 0) {
      displayHash = fusionDetails.fills[0].txHash;
    } else {
      showExplorerLink = false;
    }
  }

  const explorerLinkUrl = isAllbridge
    ? `https://core.allbridge.io/explorer?search=${transaction.hash}`
    : getExplorerUrl(chainId, 'tx', displayHash);
  const timestamp = isLocal
    ? (transaction as LocalTransactionWithStatus).timestamp
    : (transaction as TransactionItem).metadata?.blockTimestamp
      ? new Date((transaction as TransactionItem).metadata.blockTimestamp).getTime()
      : null;
  const destinationHash =
    backendStatus?.destinationHash ||
    (isLocal ? (transaction as LocalTransactionWithStatus).destinationHash : null);
  const getTransactionAssetSymbol = (t: any): string => {
    if (t.isBackendOrder) {
      return t.fromToken || '';
    }
    const desc = t.description || '';
    const swapMatch = desc.match(/Swap\s+(?:[\d.]+\s+)?([A-Za-z0-9]+)/i);
    if (swapMatch) return swapMatch[1];
    const approveMatch = desc.match(/Approve\s+([A-Za-z0-9]+)/i);
    if (approveMatch) return approveMatch[1];
    const sendMatch = desc.match(/(?:Send|Transfer|Bridge)\s+(?:[\d.]+\s+)?([A-Za-z0-9]+)/i);
    if (sendMatch) return sendMatch[1];
    return '';
  };

  let assetLogo = undefined;
  let assetSymbol = '';
  if (!isLocal) {
    const tx = transaction as TransactionItem;
    assetSymbol = formatAssetName(tx);
    if (tx.asset) assetLogo = getGlobalAssetMetadata(tx.asset)?.logoURI;
    if (!assetLogo && tx.rawContract?.address)
      assetLogo = getAssetByAddress(chainId, tx.rawContract.address)?.logoURI;
  } else {
    assetSymbol = getTransactionAssetSymbol(transaction);
    if (assetSymbol) assetLogo = getGlobalAssetMetadata(assetSymbol)?.logoURI;
  }

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

  const amountIn = (transaction as any).amountIn;
  const amount = isBackendOrder
    ? `- ${amountIn}`
    : isLocal
      ? '—'
      : getDisplayAmountWithSign(formatTxAmount(transaction as TransactionItem), incoming, isSelf);
  const assetName = isBackendOrder
    ? (transaction as any).fromToken || ''
    : isLocal
      ? ''
      : formatAssetName(transaction as TransactionItem);

  return (
    <div className="flex flex-col h-full bg-secondary rounded-2xl overflow-hidden border border-color shadow-sm">
      <div className="bg-tertiary/30 p-8 flex flex-col items-center justify-center border-b border-color relative">
        {(isLocal || onClose) && (
          <div className="absolute top-6 right-6 flex items-center gap-2">
            {isLocal && (
              <button
                onClick={onRefresh}
                className="p-2.5 rounded-xl bg-tertiary hover:bg-tertiary/80 text-muted hover:text-primary transition-all active:scale-95 shadow-sm"
                title="Refresh Status"
              >
                <RefreshCw size={18} className={status === 'pending' ? 'animate-spin' : ''} />
              </button>
            )}
            {onClose && (
              <button
                onClick={onClose}
                className="p-2.5 rounded-xl bg-tertiary hover:bg-tertiary/80 text-muted hover:text-primary transition-all active:scale-95 shadow-sm"
                title="Close Details"
              >
                <X size={18} />
              </button>
            )}
          </div>
        )}
        <div className="relative w-20 h-20 mb-6">
          <div
            className={`w-full h-full rounded-full flex items-center justify-center shadow-inner border border-color overflow-hidden bg-primary ${type === 'approval' ? 'bg-blue-500/10 border-blue-500/20' : 'bg-tertiary'}`}
          >
            {type === 'approval' ? (
              <ShieldCheck className="w-10 h-10 text-blue-500" />
            ) : assetLogo ? (
              <img
                src={assetLogo}
                alt={assetSymbol || chainSymbol}
                className="w-full h-full object-cover rounded-full"
              />
            ) : (
              <div className="text-lg font-black text-primary">
                {assetSymbol ? assetSymbol.slice(0, 3).toUpperCase() : chainSymbol.slice(0, 2)}
              </div>
            )}
          </div>
          {logoUrl && (
            <img
              src={logoUrl}
              alt={chainSymbol}
              className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full border-2 border-secondary object-cover bg-secondary animate-fade-in"
            />
          )}
        </div>
        {!isLocal || isBackendOrder ? (
          <div className="text-center mb-2">
            <div className="text-3xl font-black text-primary tracking-tight mb-1">
              {amount} <span className="text-xl text-muted font-bold ml-1">{assetName}</span>
            </div>
            <div className="text-sm font-semibold text-muted">{cleanLabel(description, type)}</div>
          </div>
        ) : (
          <div className="text-2xl font-black text-primary tracking-tight text-center max-w-[80%] leading-tight mb-2">
            {cleanLabel(description, type)}
          </div>
        )}
        <div className="flex items-center gap-3 mt-2">
          {getStatusDisplay()}
          <div className="h-1 w-1 rounded-full bg-muted/30" />
          <span
            className={`text-xs font-bold text-muted uppercase tracking-[0.2em] px-3 py-1 rounded-full border border-color/30 ${type === 'approval' ? 'bg-blue-500/10 text-blue-500' : 'bg-tertiary/50'}`}
          >
            {isLocal ? displayType : (transaction as TransactionItem).category}
          </span>
        </div>
      </div>

      <div className="p-4 space-y-8 overflow-y-auto flex-1 custom-scrollbar">
        {isBackendOrder && (
          <>
            <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
              <h4 className="text-xs font-bold text-muted uppercase tracking-wider">
                Order Details
              </h4>

              <div className="bg-tertiary/20 rounded-2xl border border-color/40 p-4 space-y-4 shadow-inner">
                {/* You Pay Section */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center border border-color/30 overflow-hidden shrink-0 shadow-sm">
                      {getGlobalAssetMetadata((transaction as any).fromToken)?.logoURI ? (
                        <img
                          src={getGlobalAssetMetadata((transaction as any).fromToken)?.logoURI}
                          alt={(transaction as any).fromToken}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-xs font-black text-primary">
                          {(transaction as any).fromToken?.slice(0, 2).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div>
                      <span className="text-[10px] text-muted block uppercase tracking-wider font-bold opacity-60">
                        You Pay
                      </span>
                      <div className="flex items-baseline gap-1">
                        <span className="text-base font-black text-primary font-mono leading-none">
                          {(transaction as any).amountIn}
                        </span>
                        <span className="text-xs font-black text-muted leading-none">
                          {(transaction as any).fromToken}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Source Chain */}
                  <div className="flex items-center gap-1.5 bg-tertiary/50 px-2.5 py-1 rounded-xl border border-color/20 shadow-sm">
                    {getChainLogoUrl((transaction as any).fromChainSymbol || chainId) && (
                      <img
                        src={getChainLogoUrl((transaction as any).fromChainSymbol || chainId)}
                        alt=""
                        className="w-4 h-4 rounded-full bg-primary"
                      />
                    )}
                    <span className="text-xs font-bold text-primary font-mono">
                      {(transaction as any).fromChainSymbol}
                    </span>
                  </div>
                </div>

                {/* Vertical Divider Arrow */}
                <div className="flex items-center justify-center py-1">
                  <div className="h-px bg-color/50 flex-1" />
                  <div className="mx-3 p-1.5 rounded-full bg-primary border border-color shadow-sm text-muted animate-pulse">
                    <ArrowDown size={14} />
                  </div>
                  <div className="h-px bg-color/50 flex-1" />
                </div>

                {/* You Receive Section */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center border border-color/30 overflow-hidden shrink-0 shadow-sm">
                      {getGlobalAssetMetadata((transaction as any).toToken)?.logoURI ? (
                        <img
                          src={getGlobalAssetMetadata((transaction as any).toToken)?.logoURI}
                          alt={(transaction as any).toToken}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-xs font-black text-primary">
                          {(transaction as any).toToken?.slice(0, 2).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div>
                      <span className="text-[10px] text-muted block uppercase tracking-wider font-bold opacity-60">
                        You Receive
                      </span>
                      <div className="flex items-baseline gap-1">
                        <span className="text-base font-black text-primary font-mono leading-none">
                          {(transaction as any).amountOut}
                        </span>
                        <span className="text-xs font-black text-muted leading-none">
                          {(transaction as any).toToken}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Destination Chain */}
                  <div className="flex items-center gap-1.5 bg-tertiary/50 px-2.5 py-1 rounded-xl border border-color/20 shadow-sm">
                    {getChainLogoUrl(
                      (transaction as any).toChainSymbol ||
                        (transaction as any).fromChainSymbol ||
                        chainId
                    ) && (
                      <img
                        src={getChainLogoUrl(
                          (transaction as any).toChainSymbol ||
                            (transaction as any).fromChainSymbol ||
                            chainId
                        )}
                        alt=""
                        className="w-4 h-4 rounded-full bg-primary"
                      />
                    )}
                    <span className="text-xs font-bold text-primary font-mono">
                      {(transaction as any).toChainSymbol || (transaction as any).fromChainSymbol}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div className="h-px bg-color w-full" />
          </>
        )}

        <div className="space-y-2">
          <h4 className="text-xs font-bold text-muted uppercase tracking-wider">
            Transaction Info
          </h4>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-secondary">Tx Hash</span>
              <div className="flex items-center gap-2">
                <span
                  className="text-sm font-mono text-primary truncate max-w-[120px] md:max-w-[200px]"
                  title={displayHash}
                >
                  {displayHash.slice(0, 6)}...{displayHash.slice(-4)}
                </span>
                <button
                  onClick={() => handleCopy(displayHash, 'hash')}
                  className="p-1.5 hover:bg-tertiary rounded-md text-muted hover:text-primary transition-colors"
                >
                  {copiedField === 'hash' ? (
                    <Check size={14} className="text-primary" />
                  ) : (
                    <Copy size={14} />
                  )}
                </button>
                {showExplorerLink && (
                  <a
                    href={explorerLinkUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 hover:bg-tertiary rounded-md text-muted hover:text-primary transition-colors"
                    title={isAllbridge ? 'View on Allbridge Explorer' : 'View on Explorer'}
                  >
                    <ExternalLink size={14} />
                  </a>
                )}
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
                {timestamp
                  ? new Date(timestamp).toLocaleString()
                  : isLocal
                    ? 'Just now'
                    : 'Unknown Time'}
              </span>
            </div>
          </div>
        </div>

        <div className="h-px bg-color w-full" />

        {(!isLocal || (isLocal && type === 'bridge')) && (
          <>
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-muted uppercase tracking-wider">
                Transfer Details
              </h4>
              <div className="bg-tertiary/50 p-3 rounded-xl space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted font-semibold uppercase">From</span>
                  <button
                    onClick={() =>
                      handleCopy(
                        isLocal
                          ? (transaction as LocalTransactionWithStatus).from || ''
                          : (transaction as TransactionItem).from,
                        'from'
                      )
                    }
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
                  {isLocal
                    ? (transaction as LocalTransactionWithStatus).from || '—'
                    : (transaction as TransactionItem).from}
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
                    onClick={() =>
                      handleCopy(
                        isLocal
                          ? (transaction as LocalTransactionWithStatus).to || ''
                          : (transaction as TransactionItem).to,
                        'to'
                      )
                    }
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
                  {isLocal
                    ? (transaction as LocalTransactionWithStatus).to || '—'
                    : (transaction as TransactionItem).to}
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
              <span className="text-sm font-semibold text-primary capitalize">{displayType}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TransactionDetailsView;
