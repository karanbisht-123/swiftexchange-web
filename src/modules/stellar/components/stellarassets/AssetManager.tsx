import { useNavigate } from 'react-router-dom';

import PageLayout from '../../../../components/layout/PageLayout';
import StellarActiveGuard from '../../../walletconnect/components/StellarActiveGuard';
import { WalletType } from '../../../walletconnect/constants/Wallet';
import { useWalletConnect } from '../../../walletconnect/hooks/useWalletConnect';
import UnifiedAssets from './UnifiedAssets';

const AssetManager: React.FC = () => {
  const navigate = useNavigate();
  const { connectedWallets } = useWalletConnect();
  const stellarWallet = connectedWallets[WalletType.STELLAR];
  const stellarAddress = stellarWallet?.address || '';

  const handleAssetClick = (asset: any) => {
    navigate(`/send?asset=${asset.ticker}&chainId=stellar`);
  };

  return (
    <PageLayout
      title="Assets"
      subtitle="Manage Your Portfolio"
      maxWidth="xl"
      isBeta
      betaMessage="This feature is currently in Beta. We're actively testing and improving it."
    >
      <StellarActiveGuard requireConnected={false}>
        <UnifiedAssets userAddress={stellarAddress} onAssetClick={handleAssetClick} />
      </StellarActiveGuard>
    </PageLayout>
  );
};

export default AssetManager;
