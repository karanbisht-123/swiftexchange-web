import React, { useState, memo } from 'react';
import { usePositionStore } from '../../../core/stores/positionStore';
import { useTickerStore } from '../../../core/stores/tickerStore';
import { usePositionActions } from '../../../adapters/aster/hooks/usePositionActions';
import { ConfirmationModal } from '../../../../components/common/ConfirmationModal';

interface Props {
  signer: any;
  userAddr: string;
}

const PositionRow = memo(({ position, signer, userAddr }: { position: any, signer: any, userAddr: string }) => {
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [reverseModalOpen, setReverseModalOpen] = useState(false);
  
  const assetCtx = useTickerStore(state => state.assetCtxByMarket[position.symbol]);
  const { isProcessing, closePosition, reversePosition } = usePositionActions(signer, userAddr);

  const handleConfirmClose = async () => {
    const isLong = parseFloat(position.size) > 0;
    await closePosition(position.symbol, position.size, isLong);
    setCloseModalOpen(false);
  };

  const handleConfirmReverse = async () => {
    const isLong = parseFloat(position.size) > 0;
    await reversePosition(position.symbol, position.size, isLong);
    setReverseModalOpen(false);
  };

  const isLong = parseFloat(position.size) > 0;
  const markPrice = assetCtx?.markPx || position.markPrice || '0';
  
  const entryVal = parseFloat(position.entryPrice);
  const sizeVal = parseFloat(position.size);
  const absSize = Math.abs(sizeVal);
  const markVal = parseFloat(markPrice);
  const leverage = position.leverage > 0 ? position.leverage : 1;
  const marginCalc = (entryVal * absSize) / leverage;
  
  const pnlVal = isLong ? (markVal - entryVal) * absSize : (entryVal - markVal) * absSize;
  const marginDenom = marginCalc === 0 ? 1 : marginCalc;
  const roe = (pnlVal / marginDenom) * 100;
  
  const breakEven = isLong ? entryVal * 1.0008 : entryVal * 0.9992;
  
  return (
    <tr className="border-b border-color hover:bg-hover">
      <td className="px-4 py-2 text-primary font-medium">
        <div className="flex flex-col">
          <span>{position.symbol.replace('-', '')}</span>
          <span className={`text-[10px] ${isLong ? 'text-success' : 'text-danger'}`}>
            {isLong ? 'Buy' : 'Sell'} {position.leverage > 0 ? position.leverage : '--'}x {position.marginType === 'isolated' ? '||' : '|||'}
          </span>
        </div>
      </td>
      <td className={`px-4 py-2 ${isLong ? 'text-success' : 'text-danger'}`}>
        <div className="flex flex-col">
          <span>{absSize}</span>
          <span className="text-[10px] text-secondary">{position.symbol.split('-')[0]}</span>
        </div>
      </td>
      <td className="px-4 py-2 text-primary">{entryVal.toFixed(2)}</td>
      <td className="px-4 py-2 text-primary">{markVal.toFixed(2)}</td>
      <td className="px-4 py-2 text-primary">
        <div className="flex flex-col">
          <span>{marginCalc.toFixed(2)} USDT</span>
          <span className="text-[10px] text-secondary">({position.marginType === 'isolated' ? 'Isolated' : 'Cross'})</span>
        </div>
      </td>
      <td className="px-4 py-2 text-primary">{parseFloat(position.liquidationPrice) === 0 ? '--' : parseFloat(position.liquidationPrice).toFixed(2)}</td>
      <td className="px-4 py-2 text-primary">{breakEven.toFixed(2)}</td>
      <td className={`px-4 py-2 ${pnlVal > 0 ? 'text-success' : pnlVal < 0 ? 'text-danger' : 'text-primary'}`}>
        <div className="flex flex-col">
          <span>{pnlVal > 0 ? '+' : ''}{pnlVal.toFixed(2)} USDT</span>
          <span>{roe > 0 ? '+' : ''}{roe.toFixed(2)}%</span>
        </div>
      </td>
      <td className="px-4 py-2 text-primary">
        <button className="flex items-center space-x-1 hover:text-white transition-colors">
          <span>Add</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>
        </button>
      </td>
      <td className="px-4 py-2 text-primary">
        <button className="flex items-center space-x-1 hover:text-white transition-colors">
          <span>Add</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>
        </button>
      </td>
      <td className="px-4 py-2">
        <button 
          onClick={() => setReverseModalOpen(true)}
          disabled={isProcessing}
          className="text-warning cursor-pointer hover:opacity-80 transition-opacity disabled:opacity-50"
        >
          Reverse
        </button>
      </td>
      <td className="px-4 py-2 text-right">
        <button 
          onClick={() => setCloseModalOpen(true)}
          disabled={isProcessing}
          className="text-muted hover:text-danger hover:bg-danger/10 p-1.5 rounded-md transition-colors disabled:opacity-50 inline-flex items-center justify-center"
          title="Close Position"
        >
          {isProcessing ? (
            <span className="text-[10px]">...</span>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          )}
        </button>
      </td>
      
      {/* Modals */}
      <ConfirmationModal
        isOpen={closeModalOpen}
        title="Close Position"
        message={`Are you sure you want to close your ${isLong ? 'Long' : 'Short'} position for ${position.symbol.replace('-', '')} at market price?`}
        onConfirm={handleConfirmClose}
        onCancel={() => setCloseModalOpen(false)}
        confirmText="Confirm Close"
        confirmButtonType="primary"
      />

      <ConfirmationModal
        isOpen={reverseModalOpen}
        title="Reverse Position"
        message={
          <div className="flex flex-col">
            {/* Top: Current Position */}
            <div className="flex justify-between items-center border border-color p-4 rounded-xl bg-tertiary/50 hover:bg-tertiary transition-colors">
              <div className="flex flex-col">
                <span className="text-secondary text-[11px] font-medium uppercase tracking-wider mb-1">Closing</span>
                <span className="text-primary text-sm font-semibold">{absSize} <span className="text-xs text-secondary">{position.symbol.replace('-', '')}</span></span>
              </div>
              <div className="flex flex-col items-end">
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${isLong ? 'text-success bg-success/10' : 'text-danger bg-danger/10'}`}>
                  {isLong ? 'LONG' : 'SHORT'} {position.leverage}x
                </span>
                <span className="text-secondary text-[11px] mt-1.5 font-medium">Market Price</span>
              </div>
            </div>
            
            {/* Middle: Reverse Arrow */}
            <div className="flex justify-center -my-2.5 z-10 relative">
              <div className="bg-secondary border-[1.5px] border-color p-1.5 rounded-full text-primary shadow-sm hover:scale-110 transition-transform">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg>
              </div>
            </div>

            {/* Bottom: New Position */}
            <div className="flex justify-between items-center border border-color p-4 rounded-xl bg-tertiary/50 hover:bg-tertiary transition-colors">
              <div className="flex flex-col">
                <span className="text-secondary text-[11px] font-medium uppercase tracking-wider mb-1">Opening</span>
                <span className="text-primary text-sm font-semibold">{absSize} <span className="text-xs text-secondary">{position.symbol.replace('-', '')}</span></span>
              </div>
              <div className="flex flex-col items-end">
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${!isLong ? 'text-success bg-success/10' : 'text-danger bg-danger/10'}`}>
                  {!isLong ? 'LONG' : 'SHORT'} {position.leverage}x
                </span>
                <span className="text-secondary text-[11px] mt-1.5 font-medium">Market Price</span>
              </div>
            </div>
          </div>
        }
        onConfirm={handleConfirmReverse}
        onCancel={() => setReverseModalOpen(false)}
        confirmText="Confirm Reverse"
        confirmButtonType="primary"
      />
    </tr>
  );
});

export const PositionsTab: React.FC<Props> = ({ signer, userAddr }) => {
  const positions = usePositionStore(state => state.positions);
  const positionList = Object.values(positions);

  return (
    <div className="w-full h-full overflow-y-auto">
      <table className="w-full text-[11px] text-left whitespace-nowrap">
        <thead className="text-secondary border-b border-color sticky top-0 bg-primary z-10">
          <tr>
            <th className="px-4 py-2 font-medium">Symbol</th>
            <th className="px-4 py-2 font-medium">Size</th>
            <th className="px-4 py-2 font-medium">Entry price</th>
            <th className="px-4 py-2 font-medium">Mark price</th>
            <th className="px-4 py-2 font-medium">Margin</th>
            <th className="px-4 py-2 font-medium">Liq. price</th>
            <th className="px-4 py-2 font-medium">Break-Even Price</th>
            <th className="px-4 py-2 font-medium">PNL (ROE%)</th>
            <th className="px-4 py-2 font-medium">TP/SL</th>
            <th className="px-4 py-2 font-medium">TP/SL for position</th>
            <th className="px-4 py-2 font-medium">Reverse</th>
            <th className="px-4 py-2 font-medium text-right">
              {positionList.length > 0 && (
                <span className="text-warning cursor-pointer hover:opacity-80 transition-opacity">Close All</span>
              )}
            </th>
          </tr>
        </thead>
        <tbody>
          {positionList.length === 0 ? (
            <tr><td colSpan={12} className="px-4 py-8 text-center text-muted">No positions found</td></tr>
          ) : (
            positionList.map(p => (
              <PositionRow key={p.symbol} position={p} signer={signer} userAddr={userAddr} />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};
