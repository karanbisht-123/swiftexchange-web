import React, { useState } from 'react';

import { Horizon, Networks, TransactionBuilder } from '@stellar/stellar-sdk';

import { fetchApiResponseFromServer } from '../../../../service/apiService';
import { getStellarConfig } from '../../../walletconnect/config/chains';
import { WalletType } from '../../../walletconnect/constants/Wallet';
import { useWalletConnect } from '../../../walletconnect/hooks/useWalletConnect';
import { useWalletStore } from '../../../walletconnect/store/walletConnectStore';

interface ActivateTrustStepProps {
  onComplete: (data: { claimedXLM: boolean }) => void;
  onSkip: (data: { claimedXLM: boolean }) => void;
}

const ActivateTrustStep: React.FC<ActivateTrustStepProps> = ({ onComplete, onSkip }) => {
  const { getProvider } = useWalletConnect();
  const currentNetwork = useWalletStore(state => state.network);
  const stellarWallet = useWalletStore(state => state.connectedWallets.stellar);
  const stellarConfig = getStellarConfig(currentNetwork);
  const stellarAddress = stellarWallet?.address;
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const provider = getProvider(WalletType.STELLAR);
  const rawSession = (provider as any)?.session;
  const stellarAccounts: string[] = rawSession?.namespaces?.stellar?.accounts ?? [];
  const isWalletActive = stellarAccounts.length > 0 && !!stellarAddress;

  const handleClaimXLM = async () => {
    if (!stellarAddress) {
      setError('Please connect your Stellar wallet first');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const endpoint = `/wallet/${stellarAddress}/activate-wallet`;
      const res = await fetchApiResponseFromServer(endpoint, 'PATCH');
      const apiData = res.data as any;

      if (!apiData?.wallet?.xdr) {
        throw new Error('Invalid response: Missing XDR data from server');
      }

      if (!provider) {
        throw new Error('Stellar wallet provider not found');
      }

      const networkPassphrase =
        currentNetwork === 'testnet' ? Networks.TESTNET : Networks.PUBLIC;


      const tx = TransactionBuilder.fromXDR(apiData.wallet.xdr.trim(), networkPassphrase);
      const signedXdr = await provider.signTransaction(tx.toXDR());
      const signedTx = TransactionBuilder.fromXDR(signedXdr, networkPassphrase);
      const server = new Horizon.Server(stellarConfig.horizonUrl);
      const result = await server.submitTransaction(signedTx);

      if (result.hash) {
        onComplete({ claimedXLM: true });
      } else {
        onComplete({ claimedXLM: false });
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemindMeLater = () => {
    onSkip({ claimedXLM: false });
  };

  return (
    <div className="text-center space-y-6 animate-slide-up">
      <div className="flex justify-center items-center my-6">
        <div className="p-6 rounded-full bg-info-bg relative overflow-hidden">
          <div className="absolute inset-0 animate-pulse-once"></div>
          <img src="/active.png" alt="Activate wallet" className="relative z-10 w-16 h-16" />
        </div>
      </div>

      <h3 className="heading-3">{isWalletActive ? 'Trust USDC' : 'Activate and Trust USDC'}</h3>

      <p className="text-secondary max-w-xs mx-auto">
        {isWalletActive
          ? 'Your wallet is already activated. Add USDC to your wallet to start trading.'
          : `Your Stellar wallet is not activated yet. Activate it now to automatically trust USDC and start using all features seamlessly.`}
      </p>

      {!stellarAddress && (
        <p className="text-red-400 text-sm">Please connect your Stellar wallet first</p>
      )}

      {error && (
        <div className="card bg-danger-bg border border-red-300 text-left">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <div className="space-y-3">
        <button
          onClick={handleClaimXLM}
          className="btn btn-primary w-full btn-lg animate-pulse-once"
          disabled={isWalletActive || !stellarAddress || isLoading}
        >
          {isLoading ? 'Processing...' : isWalletActive ? 'Wallet Already Activated' : 'Claim 5 XLM Now'}
        </button>

        <button onClick={handleRemindMeLater} className="btn btn-secondary w-full btn-lg">
          Remind Me Later
        </button>
      </div>
    </div>
  );
};

export default ActivateTrustStep;
