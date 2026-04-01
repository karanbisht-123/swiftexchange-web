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
      <div className="bg-tertiary p-1.5 rounded-2xl flex mb-8 border border-color shadow-inner">
        <button
          onClick={() => setActiveTab('EVM_TO_STELLAR')}
          className={`flex-1 py-3 text-sm font-bold rounded-xl transition-all duration-300 ${
            activeTab === 'EVM_TO_STELLAR'
              ? 'bg-primary text-secondary shadow-lg scale-[1.02] z-10'
              : 'text-muted hover:text-primary hover:bg-secondary/50'
          }`}
        >
          EVM to Stellar
        </button>
        <button
          onClick={() => setActiveTab('STELLAR_TO_EVM')}
          className={`flex-1 py-3 text-sm font-bold rounded-xl transition-all duration-300 ${
            activeTab === 'STELLAR_TO_EVM'
              ? 'bg-primary text-secondary shadow-lg scale-[1.02] z-10'
              : 'text-muted hover:text-primary hover:bg-secondary/50'
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
