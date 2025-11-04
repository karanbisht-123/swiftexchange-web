import React, { useState } from 'react';

import PageLayout from '../../../../components/layout/PageLayout';
import { WalletType } from '../../../walletconnect/constants/Wallet';
import { useWalletConnect } from '../../../walletconnect/hooks/useWalletConnect';
import GlobalAssets from './GlobalAssets';
import UserAssets from './UserAssets';

const AssetManager: React.FC = () => {
  const [activeTab, setActiveTab] = useState(0);
  const { connectedWallets } = useWalletConnect();
  const stellarWallet = connectedWallets[WalletType.STELLAR];
  const stellarAddress = stellarWallet?.address || '';

  const handleTabChange = (index: number) => {
    setActiveTab(index);
  };

  const handleAddAsset = (assetId: string) => {
    // Implementation for adding asset (e.g., update store or trigger trustline)
    console.log('Asset added:', assetId);
  };

  return (
    <PageLayout title="Assets" subtitle="Manage Assets" maxWidth="xl">
      <div className="">
        {/* Tabs Navigation */}
        <div className="flex border-b ">
          <button
            onClick={() => handleTabChange(0)}
            className={`flex items-center px-4 py-2 text-sm font-medium ${
              activeTab === 0
                ? 'border-b-2 border-blue-500 text-blue-600'
                : 'text-gray-600 hover:text-blue-600'
            }`}
          >
            All Assets
          </button>
          <button
            onClick={() => handleTabChange(1)}
            className={`flex items-center px-4 py-2 text-sm font-medium ${
              activeTab === 1
                ? 'border-b-2 border-blue-500 text-blue-600'
                : 'text-gray-600 hover:text-blue-600'
            }`}
          >
            My Assets
          </button>
        </div>

        {/* Tab Content */}
        <div className="mt-4">
          {activeTab === 0 && (
            <GlobalAssets userAddress={stellarAddress} onAddAsset={handleAddAsset} />
          )}
          {activeTab === 1 && <UserAssets userAddress={stellarAddress} />}
        </div>
      </div>
    </PageLayout>
  );
};

export default AssetManager;
