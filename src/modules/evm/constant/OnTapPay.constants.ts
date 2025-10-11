import { type TransactionStep } from '../../../types/evm/onTapPay.types';

export const TRANSACTION_STEP = {
  IDLE: 'idle',
  FETCHING_QUOTES: 'fetching_quotes',
  PREPARING_APPROVAL: 'preparing_approval',
  SIGNING_APPROVAL: 'signing_approval',
  EXECUTING_APPROVAL: 'executing_approval',
  PREPARING_SWAP: 'preparing_swap',
  SIGNING_SWAP: 'signing_swap',
  EXECUTING_SWAP: 'executing_swap',
  PREPARING_BRIDGE: 'preparing_bridge',
  EXECUTING_BRIDGE: 'executing_bridge',
  COMPLETED: 'completed',
  ERROR: 'error',
} as const;

export const TRANSACTION_STEP_MESSAGES: Record<TransactionStep, string> = {
  [TRANSACTION_STEP.IDLE]: 'Ready to start',
  [TRANSACTION_STEP.FETCHING_QUOTES]: 'Fetching quotes...',
  [TRANSACTION_STEP.PREPARING_APPROVAL]: 'Preparing token approval...',
  [TRANSACTION_STEP.SIGNING_APPROVAL]: 'Please sign approval transaction...',
  [TRANSACTION_STEP.EXECUTING_APPROVAL]: 'Executing approval...',
  [TRANSACTION_STEP.PREPARING_SWAP]: 'Preparing swap transaction...',
  [TRANSACTION_STEP.SIGNING_SWAP]: 'Please sign swap transaction...',
  [TRANSACTION_STEP.EXECUTING_SWAP]: 'Executing swap...',
  [TRANSACTION_STEP.PREPARING_BRIDGE]: 'Preparing bridge transfer...',
  [TRANSACTION_STEP.EXECUTING_BRIDGE]: 'Executing bridge transfer...',
  [TRANSACTION_STEP.COMPLETED]: 'Transaction completed successfully!',
  [TRANSACTION_STEP.ERROR]: 'Transaction failed',
};
