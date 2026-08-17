import React, { useState } from 'react';

//import { exchangeManager, useExchangeManager, type ExchangeName } from '../../core/ExchangeManager';
import { useExchangeManager } from '../../core/ExchangeManager';
import { useMarketStore } from '../../core/stores/marketStore';
import { useOrderbookStore } from '../../core/stores/orderbookStore';
import { useTickerStore } from '../../core/stores/tickerStore';
import { CoinIcon } from '../ui/CoinIcon';
import { MarketSelectorModal } from './MarketSelectorModal';

function formatLargeNumber(num: number): string {
  if (!isFinite(num) || isNaN(num)) return '0.00';
  if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
  if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
  if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
  return num.toFixed(2);
}

function formatPrice(px: number): string {
  if (px <= 0 || isNaN(px)) return '—';
  return px.toLocaleString('en-US', {
    minimumFractionDigits: px < 10 ? 4 : 2,
    maximumFractionDigits: px < 10 ? 4 : 2,
  });
}
export const ExchangeTopBar: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const symbol = useMarketStore(state => state.selectedSymbol);
  const assetCtx = useTickerStore(state => state.assetCtxByMarket[symbol]);
  const currentExchange = useExchangeManager(state => state.currentExchange);

  // Mark price from backend ticker; fall back to orderbook mid-price if unavailable
  const markPxFromTicker = parseFloat(assetCtx?.markPx || '0');
  const orderbook = useOrderbookStore(state => state.books[symbol]);
  const midPrice =
    orderbook?.bids?.[0] && orderbook?.asks?.[0]
      ? (parseFloat(orderbook.bids[0].price) + parseFloat(orderbook.asks[0].price)) / 2
      : 0;
  const markPrice = markPxFromTicker > 0 ? markPxFromTicker : midPrice;

  const oraclePx = parseFloat(assetCtx?.oraclePx || '0');
  const prevDayPx = parseFloat(assetCtx?.prevDayPx || '0');
  const dayNtlVlm = parseFloat(assetCtx?.dayNtlVlm || '0');
  const openInterest = parseFloat(assetCtx?.openInterest || '0');

  const [liveFundingRate, setLiveFundingRate] = useState<number>(0);
  const [fundingIntervalHours, setFundingIntervalHours] = useState<number>(8);
  const [nextFundingTime, setNextFundingTime] = useState<number | null>(null);
  const [countdown, setCountdown] = useState<string>('--:--:--');

  const fetchFundingInfo = React.useCallback(async () => {
    try {
      if (currentExchange !== 'aster') return;
      const { getRealTimeFundingRate } = await import('../../adapters/aster/api/funding');
      const asterSymbol = symbol.replace('-', '');
      const info = await getRealTimeFundingRate(asterSymbol);
      if (info) {
        setLiveFundingRate(parseFloat(info.lastFundingRate));
        setFundingIntervalHours(info.fundingIntervalHours);
        setNextFundingTime(info.nextFundingTime);
      }
    } catch (e) {
      console.error('Failed to fetch funding info', e);
    }
  }, [symbol, currentExchange]);

  React.useEffect(() => {
    fetchFundingInfo();
  }, [fetchFundingInfo]);

  React.useEffect(() => {
    if (!nextFundingTime) {
      setCountdown('--:--:--');
      return;
    }

    const updateCountdown = () => {
      const now = Date.now();
      const diff = nextFundingTime - now;
      if (diff <= 0) {
        setCountdown('00:00:00');
        // Countdown hit zero, refresh funding info
        fetchFundingInfo();
      } else {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        setCountdown(
          `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
        );
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [nextFundingTime, fetchFundingInfo]);

  const changePct = prevDayPx > 0 ? ((markPrice - prevDayPx) / prevDayPx) * 100 : 0;
  const isChangePositive = changePct >= 0;
  const changePctDisplay =
    !isNaN(changePct) && isFinite(changePct)
      ? `${isChangePositive ? '+' : ''}${changePct.toFixed(2)}%`
      : '--';

  const isFundingPositive = liveFundingRate >= 0;

  return (
    <>
      <div className="flex items-center px-4 h-[50px] border-b border-color bg-secondary shrink-0 w-full relative overflow-hidden min-w-0 max-w-[760px]">
        <div className="flex items-center shrink-0 z-10 bg-secondary">
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-3 hover:bg-hover px-2 py-1.5 rounded-lg transition-colors -ml-2"
          >
            <div className="relative shrink-0 flex flex-col items-center">
              <CoinIcon symbol={symbol} size={32} />
              <span className="absolute -bottom-2.5 text-yellow-950 bg-gradient-to-r from-yellow-400 to-amber-500 text-[9px] leading-tight px-1 py-[1px] rounded-[3px] font-bold uppercase tracking-widest shadow-sm z-10 pointer-events-none border border-yellow-200/50">
                BETA
              </span>
            </div>

            <div className="flex flex-col items-start gap-1.5">
              <div className="flex items-center gap-1.5 leading-none">
                <span className="text-primary font-bold text-[14px]">
                  {symbol.replace('-', '')}
                </span>
                <span className="text-[#a0a5ad] text-[9px] bg-tertiary border border-color px-1 py-0.5 rounded font-medium">
                  Perp
                </span>
              </div>
              <div className="flex items-center gap-2 leading-none">
                <span
                  className={`text-[12px] font-semibold ${isChangePositive ? 'text-success' : 'text-danger'}`}
                >
                  {formatPrice(markPrice)}
                </span>
                <span
                  className={`text-[10px] font-medium ${isChangePositive ? 'text-success' : 'text-danger'}`}
                >
                  {changePctDisplay}
                </span>
              </div>
            </div>
            <svg
              className="text-muted ml-1"
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
          </button>

          <div className="h-8 w-px bg-border-color mx-4" />
        </div>

        <div className="flex items-center gap-8 overflow-x-auto [&::-webkit-scrollbar]:hidden whitespace-nowrap flex-1 min-w-0 h-full px-2 mask-edges">
          <div className="flex flex-col gap-1">
            <span className="text-muted text-[10px] uppercase tracking-wider font-medium">
              Mark Price
            </span>
            <span className="text-primary text-[13px] font-semibold">
              {formatPrice(markPrice)}
              {markPxFromTicker === 0 && midPrice > 0 && (
                <span className="text-muted text-[9px] ml-1 font-normal">(mid)</span>
              )}
            </span>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-muted text-[10px] uppercase tracking-wider font-medium">
              Index Price
            </span>
            <span className="text-secondary text-[13px] font-semibold">
              {formatPrice(oraclePx > 0 ? oraclePx : markPrice)}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-muted text-[10px] uppercase tracking-wider font-medium">
              24h Change
            </span>
            <span
              className={`text-[13px] font-semibold ${isChangePositive ? 'text-success' : 'text-danger'}`}
            >
              {changePctDisplay}
            </span>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-muted text-[10px] uppercase tracking-wider font-medium">
              24h Volume (USDT)
            </span>
            <span className="text-primary text-[13px] font-semibold">
              {formatLargeNumber(dayNtlVlm)}
            </span>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-muted text-[10px] uppercase tracking-wider font-medium">
              Open Interest
            </span>
            <span className="text-primary text-[13px] font-semibold">
              {formatLargeNumber(openInterest)}
            </span>
          </div>

          <div className="flex flex-col gap-1 pr-4">
            <span className="text-muted text-[10px] uppercase tracking-wider font-medium">
              Funding({fundingIntervalHours}h)/Countdown
            </span>
            <div className="flex items-center gap-1">
              <span
                className={`text-[13px] font-semibold ${isFundingPositive ? 'text-success' : 'text-danger'}`}
              >
                {!isNaN(liveFundingRate) && isFinite(liveFundingRate)
                  ? (liveFundingRate * 100).toFixed(4) + '%'
                  : '--'}
              </span>
              <span className="text-muted text-[13px] font-medium">/ {countdown}</span>
            </div>
          </div>
        </div>
        {/* <div className="flex items-center pl-4 shrink-0 z-10 bg-secondary h-full ml-2">

          <div className="flex items-center gap-4 pl-4 border-l border-color h-full">
            <select
              value={currentExchange}
              onChange={(e) => exchangeManager.setExchange(e.target.value as ExchangeName)}
              className="bg-tertiary text-primary text-[11px] font-medium border border-color rounded-md px-3 py-1.5 outline-none cursor-pointer hover:border-brand/50 transition-colors"
            >
              <option value="aster">Aster V3</option>
              <option value="hyperliquid">Hyperliquid</option>
            </select>
          </div>
        </div> */}
      </div>

      <MarketSelectorModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  );
};
