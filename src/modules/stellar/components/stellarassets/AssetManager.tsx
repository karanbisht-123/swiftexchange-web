import { AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import PageLayout from '../../../../components/layout/PageLayout';
import { WalletType } from '../../../walletconnect/constants/Wallet';
import { useStellarAccountStatus } from '../../../walletconnect/hooks/useStellarAccountStatus';
import { useWalletConnect } from '../../../walletconnect/hooks/useWalletConnect';
import UnifiedAssets from './UnifiedAssets';

const AssetManager: React.FC = () => {
  const navigate = useNavigate();
  const { connectedWallets } = useWalletConnect();
  const stellarWallet = connectedWallets[WalletType.STELLAR];
  const stellarAddress = stellarWallet?.address || '';
  const { isActive, isChecking } = useStellarAccountStatus(stellarAddress);

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
      {!stellarAddress ? (
        <div className="flex flex-col items-center justify-center p-8 mt-8 text-center bg-secondary rounded-3xl border border-color">
          <p className="text-muted text-sm font-medium">
            Please connect your Stellar wallet to view assets.
          </p>
        </div>
      ) : isActive === false ? (
        <div className="flex flex-col flex-1 items-center justify-center p-4 mt-8 sm:mt-12">
          <div className="w-full max-w-2xl flex flex-col items-center justify-center bg-warning/5 rounded-[2.5rem] border border-warning/20 p-8 sm:p-12 text-center min-h-[300px] shadow-sm">
            <div className="w-16 h-16 rounded-full bg-warning/10 flex items-center justify-center mb-6">
              <AlertCircle size={32} className="text-warning" />
            </div>
            <h2 className="text-warning font-black mb-3 text-xl sm:text-2xl tracking-tight">
              Wallet Not Active
            </h2>
            <p className="text-warning/80 text-sm sm:text-base font-medium max-w-md leading-relaxed">
              Your Stellar wallet is not active. Please activate it by depositing at least 1 XLM to
              manage your assets.
            </p>
          </div>
        </div>
      ) : isChecking ? (
        <div className="flex justify-center p-12">
          <div className="w-8 h-8 border-4 border-brand border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : (
        <UnifiedAssets userAddress={stellarAddress} onAssetClick={handleAssetClick} />
      )}
    </PageLayout>
  );
};

export default AssetManager;
