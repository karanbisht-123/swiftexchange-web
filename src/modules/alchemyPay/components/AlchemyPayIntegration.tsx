import { useState } from 'react';

import PageLayout from '../../../components/layout/PageLayout';
import AlchemyCryptoBuy from './AlchemyCryptoBuy';
import AlchemyCryptoSell from './AlchemyCryptoSell';

const AlchemyPayIntegration = () => {
  const [activeTab, setActiveTab] = useState('buy');

  const onClose = () => {
    console.log('Back button clicked');
  };

  const footerContent = (
    <div className="text-center text-muted">
      <p className="text-sm">
        Powered by Alchemy Pay |{' '}
        <a
          href="https://alchemypay.org"
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand hover:text-brand-hover transition-colors"
        >
          Learn More
        </a>
      </p>
    </div>
  );

  const tabs = [
    {
      id: 'buy',
      label: 'Buy Crypto',
      icon: '↙',
    },
    {
      id: 'sell',
      label: 'Sell Crypto',
      icon: '↗',
    },
  ];

  return (
    <PageLayout
      title="Buy & Sell Crypto"
      subtitle="Securely buy and sell crypto"
      onBack={onClose}
      showBackButton={!onClose}
      maxWidth="lg"
      hasFooter
      footerContent={footerContent}
    >
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="p-2 rounded-lg bg-primary">
          <div className="grid grid-cols-2 gap-2">
            {tabs.map(tab => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative py-1 lg:py-2 px-2 text-sm font-semibold rounded-lg transition-all duration-200 ${isActive
                      ? tab.id === 'buy'
                        ? 'bg-green-500 text-white shadow-md'
                        : 'bg-red-500 text-white shadow-md'
                      : 'bg-transparent text-secondary hover:bg-hover'
                    }`}
                >
                  <span className="flex items-center justify-center gap-2">
                    <span className="text-lg">{tab.icon}</span>
                    {tab.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="">
          {activeTab === 'buy' && <AlchemyCryptoBuy />}
          {activeTab === 'sell' && <AlchemyCryptoSell />}
        </div>
      </div>
    </PageLayout>
  );
};

export default AlchemyPayIntegration;
