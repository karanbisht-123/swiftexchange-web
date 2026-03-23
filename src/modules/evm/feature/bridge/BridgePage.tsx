import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import PageLayout from '../../../../components/layout/PageLayout';
import EvmToStellarBridge from './EvmToStellarBridge';
import StellarToEvmBridge from './StellarToEvmBridge';

interface Asset {
  id: string;
  symbol: string;
  name: string;
  image: string;
  balance: number;
  current_price: number;
  contractAddress?: string;
  chainId?: number;
}

const BridgePage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as { selectedAsset?: Asset } | undefined;
  const selectedAsset = state?.selectedAsset;

  const [activeTab, setActiveTab] = useState<'EVM_TO_STELLAR' | 'STELLAR_TO_EVM'>('EVM_TO_STELLAR');

  return (
    <PageLayout
      title="Bridge Assets"
      subtitle="Transfer tokens securely across networks"
      maxWidth="lg"
      onBack={() => navigate(-1)}
    >
      <div className="bg-secondary p-1 rounded-xl flex mb-6">
        <button
          onClick={() => setActiveTab('EVM_TO_STELLAR')}
          className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-colors ${
            activeTab === 'EVM_TO_STELLAR'
              ? 'bg-primary text-secondary shadow-sm'
              : 'text-muted hover:text-primary'
          }`}
        >
          EVM to Stellar
        </button>
        <button
          onClick={() => setActiveTab('STELLAR_TO_EVM')}
          className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-colors ${
            activeTab === 'STELLAR_TO_EVM'
              ? 'bg-primary text-secondary shadow-sm'
              : 'text-muted hover:text-primary'
          }`}
        >
          Stellar to EVM
        </button>
      </div>

      <div className="bg-secondary rounded-2xl shadow-xl border border-color flex-1 relative overflow-hidden flex flex-col min-h-[500px]">
        {activeTab === 'EVM_TO_STELLAR' ? (
          <EvmToStellarBridge selectedAsset={selectedAsset} />
        ) : (
          <StellarToEvmBridge />
        )}
      </div>
    </PageLayout>
  );
};

export default BridgePage;
