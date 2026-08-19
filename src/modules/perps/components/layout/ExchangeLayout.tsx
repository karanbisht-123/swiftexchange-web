import React, { useState } from 'react';
import type { ReactNode } from 'react';

import { useIsMobile } from '../chart/hooks/useIsMobile';
import { ExchangeChartPanel, ExchangePositionsPanel } from './ExchangeLeftPanel';
import {
  ExchangeAccountPanel,
  ExchangeOrderFormPanel,
  ExchangeRightPanel,
} from './ExchangeRightPanel';
import { ExchangeTopBar } from './ExchangeTopBar';
import { MobileOrderSheet } from './MobileOrderSheet';
import { OrderbookPanel } from './OrderbookPanel';

interface ExchangeLayoutProps {
  sidebar?: ReactNode;
}

export const ExchangeLayout: React.FC<ExchangeLayoutProps> = ({ sidebar }) => {
  const isMobile = useIsMobile();
  const [activeMobileTab, setActiveMobileTab] = useState<'Chart' | 'Orderbook' | 'Portfolio'>(
    'Chart'
  );
  const [isOrderSheetOpen, setIsOrderSheetOpen] = useState(false);

  if (isMobile) {
    return (
      <div className="flex flex-col h-[calc(100vh-60px)] w-full bg-primary font-body text-primary relative">
        {sidebar}

        <ExchangeTopBar />

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

  return (
    <div className="flex flex-col h-[calc(100vh-60px)] w-full bg-primary font-body text-primary overflow-x-hidden overflow-y-auto">
      {sidebar}

      <div className="flex flex-col flex-1 p-1 gap-1 min-w-0 max-w-full h-full min-h-0">
        <div className="flex gap-1 min-w-0 h-[70%] min-h-[560px] max-h-[70%]">
          <div className="flex flex-col flex-1 bg-secondary rounded-lg overflow-hidden min-w-0 h-full min-h-0 border border-color">
            <ExchangeChartPanel />
          </div>

          <div className="w-[300px] shrink-0 h-full min-h-0 overflow-hidden">
            <OrderbookPanel />
          </div>
          <div className="w-[295px] shrink-0 h-full min-h-0 overflow-hidden">
            <ExchangeOrderFormPanel />
          </div>
        </div>

        <div className="flex gap-1 min-w-0 h-[38%] min-h-[220px] max-h-[38%]">
          <div className="flex-1 bg-secondary rounded-lg overflow-hidden flex flex-col  min-w-0 h-full min-h-0">
            <ExchangePositionsPanel />
          </div>
          <div className="w-[295px] shrink-0 h-full min-h-0 overflow-hidden">
            <ExchangeAccountPanel />
          </div>
        </div>
      </div>
    </div>
  );
};
