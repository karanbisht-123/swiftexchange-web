import { useState } from 'react';

import PageLayout from '../../../../components/layout/PageLayout';
import { WalletType } from '../../../walletconnect/constants/Wallet';
import { useWalletConnect } from '../../../walletconnect/hooks/useWalletConnect';
import StellarSendReceive from './StellarSendReceive';
import UnifiedAssets from './UnifiedAssets';

const AssetManager: React.FC = () => {
  const [selectedAsset, setSelectedAsset] = useState<any>(null);
  const { connectedWallets } = useWalletConnect();
  const stellarWallet = connectedWallets[WalletType.STELLAR];
  const stellarAddress = stellarWallet?.address || '';

  const handleAssetClick = (asset: any) => {
    setSelectedAsset(asset);
  };

  return (
    <PageLayout
      title={selectedAsset ? 'Send/Receive' : 'Assets'}
      subtitle={selectedAsset ? 'Manage Transactions' : 'Manage Your Portfolio'}
      maxWidth="xl"
    >
      <div className="">
        {selectedAsset ? (
          <StellarSendReceive
            asset={selectedAsset}
            userAddress={stellarAddress}
            onBack={() => setSelectedAsset(null)}
          />
        ) : (
          <UnifiedAssets userAddress={stellarAddress} onAssetClick={handleAssetClick} />
        )}
      </div>
    </PageLayout>
  );
};

export default AssetManager;
