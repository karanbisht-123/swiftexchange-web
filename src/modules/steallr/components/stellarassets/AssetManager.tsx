import { useNavigate } from 'react-router-dom';

import PageLayout from '../../../../components/layout/PageLayout';
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
      <UnifiedAssets userAddress={stellarAddress} onAssetClick={handleAssetClick} />
    </PageLayout>
  );
};

export default AssetManager;
