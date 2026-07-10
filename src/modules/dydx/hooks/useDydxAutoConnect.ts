import { useEffect, useMemo, useState } from 'react';

import { useWalletStore } from '../../walletconnect/store/walletConnectStore';
import { dydxWalletService } from '../service/dydxWalletService';

export function useDydxAutoConnect() {
  const network = useWalletStore(state => state.network);
  const evmWallet = useWalletStore(state => state.connectedWallets.evm);
  const cosmosWallet = useWalletStore(state => state.connectedWallets.cosmos);

  const hasDydxAddress = useMemo(
    () => !!(evmWallet?.dydxAddress || cosmosWallet?.dydxAddress),
    [evmWallet, cosmosWallet]
  );
  const [isConnecting, setIsConnecting] = useState(false);
  useEffect(() => {
    if (
      hasDydxAddress &&
      !isConnecting &&
      dydxWalletService.getStatus() !== 'connecting' &&
      dydxWalletService.getStatus() !== 'connected' &&
      dydxWalletService.getStatus() !== 'no_subaccount'
    ) {
      setIsConnecting(true);

      dydxWalletService
        .connect(network, 0)
        .then(() => setIsConnecting(false))
        .catch(err => {
          if (err.message !== 'Connection already in progress') {
            console.warn('[useDydxAutoConnect] connect failed:', err.message);
          }
          setIsConnecting(false);
        });
    }
  }, [hasDydxAddress, network]);

  // Disconnect when the dYdX address is removed.
  useEffect(() => {
    if (!hasDydxAddress && dydxWalletService.isConnected()) {
      dydxWalletService.disconnect();
    }
  }, [hasDydxAddress]);

  return { hasDydxAddress, isConnecting };
}
