import React, { useState } from 'react';
import type { ReactNode } from 'react';
import { ExchangeChartPanel, ExchangePositionsPanel } from './ExchangeLeftPanel';
import { OrderbookPanel } from './OrderbookPanel';
import { ExchangeRightPanel } from './ExchangeRightPanel';
import { ExchangeTopBar } from './ExchangeTopBar';
import { useIsMobile } from '../chart/hooks/useIsMobile';
import { MobileOrderSheet } from './MobileOrderSheet';

interface ExchangeLayoutProps {
  sidebar?: ReactNode;
}

export const ExchangeLayout: React.FC<ExchangeLayoutProps> = ({ sidebar }) => {
  const isMobile = useIsMobile();
  const [activeMobileTab, setActiveMobileTab] = useState<'Chart' | 'Orderbook' | 'Portfolio'>('Chart');
  const [isOrderSheetOpen, setIsOrderSheetOpen] = useState(false);

  if (isMobile) {
    return (
      <div className="flex flex-col h-[calc(100vh-60px)] w-full bg-[#0b0e14] font-body text-primary relative">
        {sidebar}
        
        <ExchangeTopBar />

        {/* Mobile Navigation Tabs */}
        <div className="flex px-4 border-b border-color shrink-0 bg-secondary overflow-x-auto">
          {['Chart', 'Orderbook', 'Portfolio'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveMobileTab(tab as any)}
              className={`py-3 px-3 text-[13px] font-medium transition-colors border-b-2 whitespace-nowrap ${activeMobileTab === tab ? 'text-primary border-brand' : 'text-secondary border-transparent hover:text-primary'}`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Mobile Tab Content Area */}
        <div className="flex-1 overflow-hidden min-w-0 flex flex-col relative pb-[60px]">
          {activeMobileTab === 'Chart' && (
            <div className="flex flex-col flex-1 overflow-hidden min-w-0 bg-secondary h-full border-b border-color">
              <div className="h-[65%] shrink-0 flex flex-col border-b border-color min-w-0 overflow-hidden">
                <ExchangeChartPanel hideTopBar={true} />
              </div>
              <div className="h-[35%] shrink-0 flex flex-col min-w-0 overflow-hidden">
                <ExchangePositionsPanel />
              </div>
            </div>
          )}

          {activeMobileTab === 'Orderbook' && (
            <div className="flex-1 w-full bg-secondary h-full overflow-hidden">
              <OrderbookPanel />
            </div>
          )}

          {activeMobileTab === 'Portfolio' && (
            <div className="flex-1 w-full bg-secondary h-full overflow-hidden">
              <ExchangePositionsPanel />
            </div>
          )}
        </div>

        {/* Fixed Bottom Action Bar */}
        <div className="absolute bottom-0 left-0 right-0 h-[60px] bg-secondary border-t border-color flex items-center px-4 gap-3 z-40">
          <button 
            onClick={() => setIsOrderSheetOpen(true)}
            className="flex-1 bg-success/10 text-success border border-success hover:bg-success hover:text-white py-2.5 rounded-lg text-sm font-bold transition-all"
          >
            Buy / Long
          </button>
          <button 
            onClick={() => setIsOrderSheetOpen(true)}
            className="flex-1 bg-danger/10 text-danger border border-danger hover:bg-danger hover:text-white py-2.5 rounded-lg text-sm font-bold transition-all"
          >
            Sell / Short
          </button>
        </div>

        <MobileOrderSheet isOpen={isOrderSheetOpen} onClose={() => setIsOrderSheetOpen(false)}>
          <ExchangeRightPanel />
        </MobileOrderSheet>
      </div>
    );
  }

  // Desktop Layout
  return (
    <div className="flex flex-col h-[calc(100vh-60px)] w-full bg-[#0b0e14] font-body text-primary overflow-x-auto overflow-y-hidden">
      {sidebar}

      {/* Main Content Area */}
      <div className="flex flex-1 p-1 gap-1 overflow-hidden min-w-0">
        
        {/* Left Main Block (Chart, Orderbook, Positions) */}
        <div className="flex flex-col flex-1 gap-1 min-w-0 h-full">

          {/* Top Row: Chart + Orderbook */}
          <div className="flex h-[65%] gap-1 min-w-0">
            {/* Chart Panel */}
            <div className="flex flex-col flex-1 bg-secondary rounded-lg overflow-hidden min-w-0 h-full border border-color">
              <ExchangeChartPanel />
            </div>

            {/* Orderbook Panel */}
            <OrderbookPanel />
          </div>

          {/* Bottom Row: Positions */}
          <div className="h-[35%] bg-secondary rounded-lg overflow-hidden flex flex-col border border-color min-w-0">
            <ExchangePositionsPanel />
          </div>

        </div>

        {/* Right Panel (Order Entry) */}
        <ExchangeRightPanel />

      </div>
    </div>
  );
};
