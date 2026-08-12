import { Navigate } from 'react-router-dom';

import { ROUTES } from '../constants/routes';
import { hasStoredAgentKey } from '../modules/walletconnect/services/asterAgentKeyManager';
import { useWalletStore } from '../modules/walletconnect/store/walletConnectStore';

export const HomeRedirect = () => {
  const connectedWallets = useWalletStore(s => s.connectedWallets);
  const isConnected = Object.keys(connectedWallets).length > 0;
  const hasAgent = !!connectedWallets.evm && hasStoredAgentKey();

  if (hasAgent) {
    return <Navigate to={ROUTES.TRADING_PERPS} replace />;
  }

  if (isConnected) {
    return <Navigate to={ROUTES.DASHBOARD} replace />;
  }

  return <Navigate to={ROUTES.TRADING_EVM_SWAP} replace />;
};
