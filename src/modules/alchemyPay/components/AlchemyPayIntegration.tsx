import { useState } from 'react';

import PageLayout from '../../../components/layout/PageLayout';
import AlchemyCryptoBuy from './AlchemyCryptoBuy';
import AlchemyCryptoSell from './AlchemyCryptoSell';

const AlchemyPayIntegration = () => {
  const [activeTab, setActiveTab] = useState('buy');
  const [isTransactionActive, setIsTransactionActive] = useState(false);

  const onClose = () => {
    if (isTransactionActive) return;
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
    { id: 'buy', label: 'Buy Crypto', icon: '↙' },
    { id: 'sell', label: 'Sell Crypto', icon: '↗' },
  ];

  return (
    <PageLayout
      title="Buy & Sell Crypto"
      subtitle="Securely buy and sell crypto"
      onBack={isTransactionActive ? undefined : onClose}
      showBackButton={!onClose && !isTransactionActive}
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
                  disabled={isTransactionActive && !isActive}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative py-1 lg:py-2 px-2 text-sm font-semibold rounded-lg transition-all duration-200 ${isActive
                      ? tab.id === 'buy'
                        ? 'bg-green-500 text-white shadow-md'
                        : 'bg-red-500 text-white shadow-md'
                      : 'bg-transparent text-secondary hover:bg-hover'
                    } ${isTransactionActive && !isActive ? 'opacity-50 cursor-not-allowed' : ''}`}
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

        <div className="relative">
          {isTransactionActive && (
            <div className="absolute top-4 right-4 z-10 flex items-center gap-2 px-3 py-1.5 bg-brand-primary/10 text-brand-primary rounded-full text-xs font-bold animate-pulse">
              <div className="w-2 h-2 rounded-full bg-brand-primary" />
              Transaction in Progress
            </div>
          )}
          <div className={activeTab === 'buy' ? 'block' : 'hidden'}>
            <AlchemyCryptoBuy onOrderStateChange={setIsTransactionActive} />
          </div>
          <div className={activeTab === 'sell' ? 'block' : 'hidden'}>
            <AlchemyCryptoSell onOrderStateChange={setIsTransactionActive} />
          </div>
        </div>
      </div>
    </PageLayout>
  );
};

export default AlchemyPayIntegration;
