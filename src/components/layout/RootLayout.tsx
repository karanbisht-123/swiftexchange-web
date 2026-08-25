import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';

import { GlobalNotifications } from '@/components/notifications/GlobalNotifications';

import AssetSelectorModal from '../../modules/commonfeature/components/AssetSelectorModal';
import { AssetSelectorProvider } from '../../modules/commonfeature/components/useAssetSelectorModal';

const RootLayout = () => {
  return (
    <AssetSelectorProvider>
      <div className="flex min-h-screen bg-primary">
        <main className="flex-1">
          <Suspense
            fallback={
              <div className="flex h-screen items-center justify-center text-text-muted">
                Loading...
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </main>
      </div>
      <AssetSelectorModal />
      <GlobalNotifications />
    </AssetSelectorProvider>
  );
};

export default RootLayout;
