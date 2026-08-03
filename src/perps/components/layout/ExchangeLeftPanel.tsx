import React, { useState } from 'react';
import { ExchangeTopBar } from './ExchangeTopBar';
import TradingChart from '../chart';
import DepthChart from '../chart/DepthChart';

import { DetailsTab } from '../chart/DetailsTab';

interface ExchangeChartPanelProps {
  hideTopBar?: boolean;
}

export const ExchangeChartPanel: React.FC<ExchangeChartPanelProps> = ({ hideTopBar }) => {
  const [activeTab, setActiveTab] = useState<'price' | 'depth' | 'details'>('price');

  return (
    <>
      {!hideTopBar && <ExchangeTopBar />}
      
      <div className="flex-1 w-full h-full bg-primary relative">
        <div className="absolute inset-0">
          {activeTab === 'price' && <TradingChart activeChartTab={activeTab} onChartTabChange={setActiveTab} />}
          {activeTab === 'depth' && <DepthChart activeChartTab={activeTab} onChartTabChange={setActiveTab} />}
          {activeTab === 'details' && <DetailsTab activeChartTab={activeTab} onChartTabChange={setActiveTab} />}
        </div>
      </div>
    </>
  );
};


import { usePositionStore } from '../../core/stores/positionStore';
import { useOrderStore } from '../../core/stores/orderStore';
import { useMarketStore } from '../../core/stores/marketStore';
import { useAsterAgent } from '../../adapters/aster/hooks/useAsterAgent';

import { AssetsTab } from './tabs/AssetsTab';
import { PositionsTab } from './tabs/PositionsTab';
import { OpenOrdersTab } from './tabs/OpenOrdersTab';
import { OrderHistoryTab } from './tabs/OrderHistoryTab';
import { TradeHistoryTab } from './tabs/TradeHistoryTab';
import { TransactionHistoryTab } from './tabs/TransactionHistoryTab';

export const ExchangePositionsPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState('Assets');
  
  const positions = usePositionStore(state => state.positions);
  const orders = useOrderStore(state => state.orders);
  const selectedSymbol = useMarketStore(state => state.selectedSymbol);
  const asterSymbol = selectedSymbol.replace('-', ''); // BTC-USDT -> BTCUSDT

  const { asterSigner, userAddr } = useAsterAgent();

  const renderTabContent = () => {
    switch (activeTab) {
      case 'Assets': return <AssetsTab />;
      case 'Positions': return <PositionsTab signer={asterSigner} userAddr={userAddr!} />;
      case 'Open Orders': return <OpenOrdersTab signer={asterSigner} userAddr={userAddr!} />;
      case 'Order History': 
        return <OrderHistoryTab signer={asterSigner} userAddr={userAddr!} asterSymbol={asterSymbol} />;
      case 'Trade History': 
        return <TradeHistoryTab signer={asterSigner} userAddr={userAddr!} asterSymbol={asterSymbol} />;
      case 'Transaction History': 
        return <TransactionHistoryTab signer={asterSigner} userAddr={userAddr!} />;
      default:
        return (
          <div className="flex-1 overflow-y-auto flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-1.5">
              <div className="w-8 h-8 rounded-full bg-tertiary flex items-center justify-center text-muted mb-1">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"></ellipse><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path></svg>
              </div>
              <span className="text-primary text-[13px] font-medium">No data found</span>
              <span className="text-muted text-[11px]">Your {activeTab.toLowerCase()} will show up here</span>
            </div>
          </div>
        );
    }
  };

  const tabs = ['Open Orders', 'Positions', 'Assets', 'Order History', 'Trade History', 'Transaction History'];

  return (
    <div className="flex flex-col h-full relative min-w-0">
      <div className="flex items-center px-4 h-10 border-b border-color text-[11px] text-secondary shrink-0 overflow-x-auto bg-primary">
        <div className="flex items-center gap-6 h-full whitespace-nowrap">
          {tabs.map(tab => (
            <button 
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`h-full px-1 flex items-center gap-1.5 ${activeTab === tab ? 'text-primary font-medium border-b-2 border-brand' : 'hover:text-primary'}`}
            >
              {tab}
              {tab === 'Open Orders' && <span className="bg-tertiary text-[10px] py-0.5 px-1.5 rounded-full">{Object.values(orders).filter(o => o.status === 'new' || o.status === 'partially_filled').length}</span>}
              {tab === 'Positions' && <span className="bg-tertiary text-[10px] py-0.5 px-1.5 rounded-full">{Object.keys(positions).length}</span>}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-hidden relative bg-primary">
        {renderTabContent()}
      </div>
    </div>
  );
};
