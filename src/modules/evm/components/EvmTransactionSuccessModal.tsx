import React from 'react';
import { EvmTransactionModal } from './EvmTransactionModal';

interface EvmTransactionSuccessModalProps {
  txHash: string;
  explorerUrl: string;
  onDone: () => void;
  title?: string;
  subtitle?: string;
  networkName?: string;
}

export const EvmTransactionSuccessModal: React.FC<EvmTransactionSuccessModalProps> = ({
  txHash,
  explorerUrl,
  onDone,
  title = 'Success!',
  subtitle = 'Transaction confirmed',
  networkName,
}) => {
  return (
    <EvmTransactionModal
      status="success"
      type={title.replace(' Successful!', '').replace(' Complete', '')}
      txHash={txHash}
      description={subtitle}
      explorerUrl={explorerUrl}
      networkName={networkName}
      onDone={onDone}
    />
  );
};