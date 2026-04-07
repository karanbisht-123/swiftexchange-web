import { Outlet } from 'react-router-dom';
import { AssetSelectorProvider } from '../../modules/commonfeature/components/useAssetSelectorModal';
import AssetSelectorModal from '../../modules/commonfeature/components/AssetSelectorModal';

// Force HMR refresh for the renamed useAssetSelectorModal.tsx

const RootLayout = () => {
  return (
    <AssetSelectorProvider>
      <div className="flex min-h-screen bg-primary">
        <main className="flex-1">
          <Outlet />
        </main>
      </div>
      <AssetSelectorModal />
    </AssetSelectorProvider>
  );
};

export default RootLayout;
