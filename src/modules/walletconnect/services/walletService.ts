/**
 * walletService.ts  (root shim)
 *
 * This file is intentionally kept as a thin re-export so all consumer files
 * (walletConnectStore.ts, useWalletConnect.ts, etc.) continue to import from
 * '../services/walletService' without any changes.
 *
 * All implementation lives under ./wallet/
 */

export { walletService } from './wallet/walletService';
export type {
  ConnectionState,
  DydxDerivation,
  UnifiedConnectionResult,
  WalletSession,
  WalletType,
} from './wallet/types';
