// @ts-nocheck
import { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';

import { ErrorBoundary } from './components/ErrorBoundary';
import { NetworkMonitor } from './components/NetworkMonitor';
import { WalletListModal } from './modules/walletconnect/components/WalletListModal';
import {
  initWalletListener,
  useWalletStore,
} from './modules/walletconnect/store/walletConnectStore';
import { initDynamicTokenLists } from './modules/evm/utils/Chainregistry';
import { useGeolocationStore } from './store/geolocationStore';
import { registerDevice } from './service/deviceService';
import router from './routes';

const isValidDevicePayload = (payload: unknown): boolean => {
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as Record<string, unknown>;
  return (
    typeof p.uniqueId === 'string' && p.uniqueId.trim() !== '' &&
    typeof p.fcmToken === 'string' && p.fcmToken.trim() !== ''
  );
};

const App = () => {
  const session = useWalletStore(state => state.session);
  const devicePayload = session?.peer?.metadata?.userDevice;

  useEffect(() => {
    initWalletListener();
    initDynamicTokenLists();
    useGeolocationStore.getState().fetchLocation();
  }, []);

  useEffect(() => {
    //clear token if it is older than 1 week
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
      console.log('Device already registered with token:', storedToken);
      return;
    }
    if (!isValidDevicePayload(devicePayload)) {
      console.warn('Device registration skipped: invalid or missing devicePayload', devicePayload);
      return;
    }

    registerDevice(devicePayload)
      .then(res => {
        const token = res.token || res.data?.token || res.deviceToken;
        if (token) {
          localStorage.setItem('device_token', token);
          localStorage.setItem('device_token_timestamp', Date.now().toString());
        }
        console.log('Device registration success:', res);
      })
      .catch(err => {
        console.error('Device registration failed:', err);
      });
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