import { isInsufficientGasError } from './skipBridgeUtils';

export type BridgeErrorType =
  | 'user_rejected'
  | 'insufficient_gas'
  | 'insufficient_balance'
  | 'rpc_failure'
  | 'bridge_api_failure'
  | 'tx_reverted'
  | 'timeout'
  | 'unknown';

export interface ClassifiedError {
  type: BridgeErrorType;
  message: string;
  retryable: boolean;
}

const USER_REJECTION_PATTERNS = [
  'user rejected',
  'user denied',
  'action_rejected',
  'rejected by user',
  'user cancelled',
  'user canceled',
  'request rejected',
  'ethersprovider: user rejected',
  'transaction rejected',
];

const RPC_FAILURE_PATTERNS = [
  'network request failed',
  'failed to fetch',
  'load failed',
  'cors',
  'cross-origin',
  'could not connect',
  'timeout after',
  'all rpcs',
  'all rpc',
  'rpc error',
  'connection refused',
  'getaddrinfo',
];

const BRIDGE_API_PATTERNS = [
  'no route',
  'no deposit route',
  'no withdrawal route',
  'no probe route',
  'skip route',
  'route returned',
  'requiredchainaddresses',
  'createvalidaddresslist',
  'invalid user addresses',
  'error fetching',
];

const REVERTED_PATTERNS = [
  'execution reverted',
  'transaction reverted',
  'reverted with reason',
  'eth_sendrawtransaction',
  'status: "0x0"',
];

const TIMEOUT_PATTERNS = ['timed out', 'timeout', 'deadline'];

function isCosmosGasFeeError(lower: string): boolean {
  const hasBroadcast =
    lower.includes('broadcasterror') || lower.includes('broadcasting transaction failed');
  const hasSpendable = lower.includes('spendable balance') && lower.includes('smaller than');
  const hasInsufficient = lower.includes('insufficient funds');
  if (hasBroadcast && (hasSpendable || hasInsufficient)) return true;
  if (hasSpendable && hasInsufficient) return true;

  return false;
}

function parseCosmosGasFeeAmounts(lower: string): { has: string | null; need: string | null } {
  const balMatch = lower.match(/spendable balance (\d+)/);
  const needMatch = lower.match(/smaller than (\d+)/);
  const has = balMatch ? (parseInt(balMatch[1], 10) / 1e6).toFixed(4) : null;
  const need = needMatch ? (parseInt(needMatch[1], 10) / 1e6).toFixed(4) : null;
  return { has, need };
}

export function classifyBridgeError(err: any): ClassifiedError {
  const raw: string = err?.message ?? err?.reason ?? String(err) ?? 'Unknown error';
  const lower = raw.toLowerCase();

  if (USER_REJECTION_PATTERNS.some(p => lower.includes(p))) {
    return {
      type: 'user_rejected',
      message: 'Transaction rejected. Please approve the request in your wallet and try again.',
      retryable: true,
    };
  }

  if (isInsufficientGasError(err)) {
    return {
      type: 'insufficient_gas',
      message:
        'Not enough ETH to pay for gas. Please add ETH to your wallet to cover the network fee and try again.',
      retryable: true,
    };
  }

  if (isCosmosGasFeeError(lower)) {
    const { has, need } = parseCosmosGasFeeAmounts(lower);
    const detail = has && need ? ` (wallet has $${has} USDC, fee requires $${need} USDC)` : '';
    return {
      type: 'insufficient_gas',
      message:
        `Not enough USDC in your dYdX wallet to cover the network gas fee${detail}. ` +
        `Your trading balance is separate — the system will attempt to top up automatically on the next retry.`,
      retryable: true,
    };
  }

  if (lower.includes('insufficient funds') && !lower.includes('gas')) {
    return {
      type: 'insufficient_balance',
      message: 'Insufficient token balance for this transaction.',
      retryable: true,
    };
  }

  if (RPC_FAILURE_PATTERNS.some(p => lower.includes(p))) {
    return {
      type: 'rpc_failure',
      message: 'Network connection failed. Please check your internet connection and try again.',
      retryable: true,
    };
  }

  if (BRIDGE_API_PATTERNS.some(p => lower.includes(p))) {
    if (lower.includes('invalid user addresses') || lower.includes('createvalidaddresslist')) {
      return {
        type: 'bridge_api_failure',
        message:
          'Failed to build the deposit route — wallet address mismatch. Please disconnect and reconnect your wallet, then try again.',
        retryable: true,
      };
    }
    return {
      type: 'bridge_api_failure',
      message:
        'No bridge route found for this amount or token. Try a different amount or source chain.',
      retryable: true,
    };
  }

  if (REVERTED_PATTERNS.some(p => lower.includes(p))) {
    return {
      type: 'tx_reverted',
      message:
        'The transaction was reverted on-chain. Your funds were not moved. Please try again or adjust slippage.',
      retryable: true,
    };
  }

  if (TIMEOUT_PATTERNS.some(p => lower.includes(p))) {
    return {
      type: 'timeout',
      message:
        'The operation timed out. Your funds may still arrive — check your wallet and bridge explorer before retrying.',
      retryable: false,
    };
  }

  return {
    type: 'unknown',
    message: raw,
    retryable: true,
  };
}
