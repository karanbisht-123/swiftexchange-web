import { WalletConnectModal } from '@walletconnect/modal';

import { type NetworkType } from '../../config/chains';

export type WalletType = 'evm' | 'stellar';

export type ConnectionState =
  'idle' | 'connecting' | 'connected' | 'signing' | 'deriving' | 'failed' | 'disconnected';

export interface WalletSession {
  type: WalletType;
  walletId: string;
  evmAddress?: string;
  evmChainId?: number;
  stellarAddress?: string;
  stellarChainId?: string;
  connectionMode?: 'unified' | 'separate';
  peerName?: string;
  peerIcon?: string;
  peerRedirect?: {
    native?: string;
    universal?: string;
    linkMode?: boolean;
  };
}



export interface UnifiedConnectionResult {
  evm?: WalletSession;
  stellar?: WalletSession;
}

export interface WalletServiceContext {
  sessions: Map<WalletType, WalletSession>;

  providers: Map<string, any>;
  modals: Map<string, WalletConnectModal>;
  eip6963Providers: Map<string, any>;
  registeredProviders: Set<any>;
  lastPingAt: Map<WalletType, number>;
  disconnecting: Set<WalletType>;
  isSignRequestInFlight: Map<WalletType, boolean>;
  derivationInProgress: boolean;
  currentNetwork: NetworkType;
  emitState: (type: WalletType, state: ConnectionState) => void;
  saveSession: () => void;
  openMobileDeepLink: (walletId: string, uri: string) => void;
  handleDisconnect: (type: WalletType) => void;
}
