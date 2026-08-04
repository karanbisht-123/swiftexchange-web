import { useCallback, useEffect, useRef, useState } from 'react';

import type { Wallet } from 'ethers';

import {
  deriveAsterAgentKey,
  encryptAndStoreAgentKey,
  getStoredAgentAddress,
  hasStoredAgentKey,
  purgeAgentKey,
  restoreAgentWallet,
} from '../../../../modules/walletconnect/services/asterAgentKeyManager';
import { walletService } from '../../../../modules/walletconnect/services/walletService';
import { useWalletStore } from '../../../../modules/walletconnect/store/walletConnectStore';

type DeriveState = 'idle' | 'signing' | 'ready' | 'error';

export interface UseAsterAgentResult {
  asterSigner: Wallet | null;
  userAddr: string | null;
  agentAddress: string | null;
  deriveState: DeriveState;
  error: Error | null;
  deriveAgentKey: () => Promise<void>;
  purge: () => void;
  isReady: boolean;
}

export function useAsterAgent(): UseAsterAgentResult {
  const evmWallet = useWalletStore(state => state.connectedWallets.evm);
  const userAddr = evmWallet?.address ?? null;

  const [asterSigner, setAsterSigner] = useState<Wallet | null>(null);
  const [agentAddress, setAgentAddress] = useState<string | null>(getStoredAgentAddress);
  const [deriveState, setDeriveState] = useState<DeriveState>('idle');
  const [error, setError] = useState<Error | null>(null);
  const derivingRef = useRef(false);

  useEffect(() => {
    if (!userAddr) {
      setAsterSigner(null);
      setAgentAddress(null);
      setDeriveState('idle');
      return;
    }

    if (!hasStoredAgentKey()) return;

    restoreAgentWallet().then(wallet => {
      if (wallet) {
        setAsterSigner(wallet);
        setAgentAddress(wallet.address);
        setDeriveState('ready');
      }
    });
  }, [userAddr]);

  const deriveAgentKey = useCallback(async () => {
    if (!userAddr) {
      throw new Error('EVM wallet not connected');
    }
    if (derivingRef.current) {
      throw new Error('Derivation request is already in progress. Please check your wallet.');
    }
    derivingRef.current = true;
    setDeriveState('signing');
    setError(null);

    try {
      const provider =
        walletService.getProvider('evm') ||
        (typeof window !== 'undefined' ? (window as any).ethereum : null);
      if (!provider) throw new Error('EVM provider not available');

      const { agentAddress: addr, wallet } = await deriveAsterAgentKey(userAddr, provider);
      await encryptAndStoreAgentKey(wallet.privateKey);

      setAsterSigner(wallet);
      setAgentAddress(addr);
      setDeriveState('ready');
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      setError(err);
      setDeriveState('error');
      throw err;
    } finally {
      derivingRef.current = false;
    }
  }, [userAddr]);

  const purge = useCallback(() => {
    purgeAgentKey();
    setAsterSigner(null);
    setAgentAddress(null);
    setDeriveState('idle');
    setError(null);
  }, []);

  useEffect(() => {
    if (!userAddr && asterSigner) purge();
  }, [userAddr, asterSigner, purge]);

  return {
    asterSigner,
    userAddr,
    agentAddress,
    deriveState,
    error,
    deriveAgentKey,
    purge,
    isReady: deriveState === 'ready' && asterSigner !== null,
  };
}
