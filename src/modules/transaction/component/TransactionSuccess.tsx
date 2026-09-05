import { CheckCircle2, Copy, ExternalLink } from 'lucide-react';

interface TransactionSuccessProps {
  txHash?: any;
  explorerUrl?: string;
  assetType?: 'evm' | 'stellar';
  onCopyHash: (hash: string) => void;
  onClose: () => void;
  onSendAnother: () => void;
}

const TransactionSuccess: React.FC<TransactionSuccessProps> = ({
  txHash,
  explorerUrl,
  assetType,
  onCopyHash,
  onClose,
  onSendAnother,
}) => {
  return (
    <div className="card text-center py-12 max-w-md mx-auto">
      <div className="w-16 h-16 bg-success-bg rounded-full flex items-center justify-center mb-6 mx-auto">
        <CheckCircle2 className="w-10 h-10 text-success" />
      </div>
      <h3 className="heading-3 mb-2 text-success">Transaction Successful!</h3>
      <p className="text-secondary mb-6">
        Your transaction has been successfully submitted to the network.
      </p>

      {txHash && assetType === 'evm' && (
        <div className="mb-6">
          <label className="block text-sm font-medium text-secondary mb-2">Transaction Hash</label>
          <div className="flex items-center gap-2 bg-tertiary p-3 rounded-lg border border-color">
            <code className="text-xs font-mono text-primary break-all flex-1">{txHash}</code>
            <button onClick={() => onCopyHash(txHash)} className="btn-ghost p-2 flex-shrink-0">
              <Copy className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {explorerUrl && (
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            View on Explorer
            <ExternalLink className="w-4 h-4" />
          </a>
        )}
        <button onClick={onSendAnother} className="btn-secondary w-full">
          Send Another Transaction
        </button>
        <button onClick={onClose} className="btn-ghost w-full">
          Close
        </button>
      </div>
    </div>
  );
};

export default TransactionSuccess;
