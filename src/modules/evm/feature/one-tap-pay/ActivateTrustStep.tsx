import React from 'react';

import * as StellarSdk from 'stellar-sdk';

import { fetchApiResponseFromServer } from '../../../../service/apiService';

const STELLAR_PUBLIC_KEY = import.meta.env.VITE_DEMO_WALLET_STELLAR_PUBLIC_KEY as string;
const STELLAR_PRIVATE_KEY = import.meta.env.VITE_DEMO_WALLET_STELLAR_PRIVATE_KEY as string;
const STELLAR_BASE_URL = 'https://horizon-testnet.stellar.org';

interface ActivateTrustStepProps {
  onComplete: (data: { claimedXLM: boolean }) => void;
  onSkip: (data: { claimedXLM: boolean }) => void;
  isWalletActive: boolean;
}

const ActivateTrustStep: React.FC<ActivateTrustStepProps> = ({
  onComplete,
  onSkip,
  isWalletActive,
}) => {
  const handleClaimXLM = async () => {
    try {
      console.log('Claiming 5 XLM now...');
      const endpoint = `/wallet/${STELLAR_PUBLIC_KEY}/activate-wallet`;
      const res = await fetchApiResponseFromServer(endpoint, 'PATCH');
      const rawXdr = res.data as any;
      if (!rawXdr || !rawXdr.wallet || !rawXdr.wallet.xdr) {
        throw new Error('Invalid response: Missing XDR data from server');
      }
      if (typeof rawXdr.wallet.xdr !== 'string' || rawXdr.wallet.xdr.trim() === '') {
        throw new Error('Invalid XDR: Expected non-empty string');
      }
      const keypair = StellarSdk.Keypair.fromSecret(STELLAR_PRIVATE_KEY);
      let tx;
      try {
        const envelope = StellarSdk.xdr.TransactionEnvelope.fromXDR(
          rawXdr.wallet.xdr.trim(),
          'base64'
        );
        tx = new StellarSdk.Transaction(envelope, StellarSdk.Networks.TESTNET);
      } catch (xdrError) {
        console.error('XDR Error:', xdrError);
        try {
          tx = StellarSdk.TransactionBuilder.fromXDR(
            rawXdr.wallet.xdr.trim(),
            StellarSdk.Networks.TESTNET
          );
          console.log('Successfully created Transaction directly from XDR');
        } catch (directError) {
          console.error('Original XDR:', rawXdr.wallet.xdr);
          try {
            const testEnvelope = StellarSdk.xdr.TransactionEnvelope.fromXDR(
              rawXdr.wallet.xdr.trim(),
              'base64'
            );
            tx = new StellarSdk.Transaction(testEnvelope, StellarSdk.Networks.PUBLIC);
          } catch (mainnetError) {
            throw new Error(`TransactionEnvelope: ${xdrError}, Direct: ${directError}`);
          }
        }
      }
      tx.sign(keypair);
      if (
        !STELLAR_BASE_URL ||
        typeof STELLAR_BASE_URL !== 'string' ||
        STELLAR_BASE_URL.trim() === ''
      ) {
        throw new Error('STELLAR_BASE_URL is not properly configured');
      }
      const server = new StellarSdk.Horizon.Server(STELLAR_BASE_URL);
      console.log('Submitting transaction to stellar');
      const result = await server.submitTransaction(tx);

      console.log('====>result', result.successful);
      if (result.successful) {
        onComplete({ claimedXLM: true });
      } else {
        onComplete({ claimedXLM: false });
      }
    } catch (error: unknown) {
      console.error('Error claiming XLM:', error);
      throw new Error(`Failed to claim XLM: ${error}`);
    }
  };

  const handleRemindMeLater = () => {
    console.log('Remind me later...');
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
          : 'Your Stellar wallet is not activated yet. Activate it now to automatically trust USDC and start using all features seamlessly.'}
      </p>

      <div className="space-y-3">
        <button
          onClick={handleClaimXLM}
          className="btn btn-primary w-full btn-lg animate-pulse-once"
          disabled={isWalletActive}
        >
          {isWalletActive ? 'Wallet Already Activated' : 'Claim 5 XLM Now'}
        </button>

        <button onClick={handleRemindMeLater} className="btn btn-secondary w-full btn-lg">
          Remind Me Later
        </button>
      </div>
    </div>
  );
};

export default ActivateTrustStep;
