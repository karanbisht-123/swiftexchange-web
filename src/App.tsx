import { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';

import { ErrorBoundary } from './components/ErrorBoundary';
import { NetworkMonitor } from './components/NetworkMonitor';
import { initDynamicTokenLists } from './modules/evm/utils/Chainregistry';
import { WalletListModal } from './modules/walletconnect/components/WalletListModal';
import {
  initWalletListener,
  useWalletStore,
} from './modules/walletconnect/store/walletConnectStore';
import router from './routes';
import { registerDevice } from './service/deviceService';
import { useGeolocationStore } from './store/geolocationStore';

const isValidDevicePayload = (payload: unknown): boolean => {
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  return (
    typeof p.uniqueId === 'string' &&
    p.uniqueId.trim() !== '' &&
    typeof p.fcmToken === 'string' &&
    p.fcmToken.trim() !== ''
  );
};

const App = () => {
  const session = useWalletStore(state => state.session);

  console.log(session?.peer?.metadata?.userDevice, '---------');
  const devicePayload = session?.peer?.metadata?.userDevice;

  useEffect(() => {
    initWalletListener();
    initDynamicTokenLists();
    useGeolocationStore.getState().fetchLocation();
  }, []);

  useEffect(() => {
    const storedTimestamp = localStorage.getItem('device_token_timestamp');
    if (storedTimestamp) {
      const elapsed = Date.now() - parseInt(storedTimestamp, 10);
      const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
      if (elapsed > ONE_WEEK_MS) {
        localStorage.removeItem('device_token');
        localStorage.removeItem('device_token_timestamp');
      }
    }

    const storedToken = localStorage.getItem('device_token');
    if (storedToken) {
      return;
    }
    if (!isValidDevicePayload(devicePayload)) {
      return;
    }

    registerDevice(devicePayload)
      .then(res => {
        const token = res.token || res.data?.token || res.deviceToken;
        if (token) {
          localStorage.setItem('device_token', token);
          localStorage.setItem('device_token_timestamp', Date.now().toString());
        }
      })
      .catch(() => {});
  }, [devicePayload]);

  return (
    <ErrorBoundary>
      <NetworkMonitor />
      <WalletListModal />
      <RouterProvider router={router} />
    </ErrorBoundary>
  );
};

export default App;
