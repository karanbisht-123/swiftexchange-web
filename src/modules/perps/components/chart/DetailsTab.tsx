import React, { useEffect, useState } from 'react';

import {
  getBrackets,
  getRealTimeFundingRate,
  getSymbolAthl,
  getSymbolDetail,
} from '../../adapters/aster/api/funding';
import { useMarketStore } from '../../core/stores/marketStore';
import { CoinIcon } from '../ui/CoinIcon';
import FundingChart from './FundingChart';

function formatLargeNumber(num: number): string {
  if (!num || isNaN(num)) return '--';
  if (num >= 1e9) return '$' + (num / 1e9).toFixed(2) + 'B';
  if (num >= 1e6) return '$' + (num / 1e6).toFixed(2) + 'M';
  if (num >= 1e3) return '$' + (num / 1e3).toFixed(2) + 'K';
  return '$' + num.toFixed(2);
}

function formatSupply(num: number, symbol: string): string {
  if (!num || isNaN(num)) return '--';
  if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B ' + symbol;
  if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M ' + symbol;
  if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K ' + symbol;
  return num.toFixed(2) + ' ' + symbol;
}

const TokenInfoView: React.FC<{ symbol: string; coin: string; data: any; athlData: any }> = ({
  symbol,
  data,
  athlData,
}) => {
  const metrics = data.metrics || {};
  const quote = metrics.quote?.USD || {};

  const marketCap = quote.market_cap || 0;
  const fdv = quote.fully_diluted_market_cap || 0;
  const vol24h = quote.volume_24h || 0;
  const dominance = quote.market_cap_dominance || 0;
  const circSupply = metrics.circulating_supply || 0;
  const maxSupply = metrics.max_supply || 0;
  const totalSupply = metrics.total_supply || 0;
  const circRate = maxSupply > 0 ? (circSupply / maxSupply) * 100 : 0;

  const ath = athlData?.ath || quote.ath || 0;
  const atl = athlData?.atl || quote.atl || 0;

  const rawAthDate = athlData?.athDate || quote.ath_date;
  const rawAtlDate = athlData?.atlDate || quote.atl_date;

  const athDate = rawAthDate ? new Date(rawAthDate).toISOString().split('T')[0] : '--';
  const atlDate = rawAtlDate ? new Date(rawAtlDate).toISOString().split('T')[0] : '--';

  const coin = symbol.split('-')[0] || 'BTC';

  return (
    <div className="flex flex-col md:flex-row h-full w-full bg-primary text-primary overflow-y-auto">
      {/* Left Column */}
      <div className="flex flex-col flex-1 p-6 border-r border-color min-w-[320px]">
        {/* Header */}
        <div className="flex flex-col gap-4 mb-6">
          <div className="flex items-center gap-3">
            <CoinIcon symbol={symbol} size={40} />
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold">{data.name}</span>
                <span className="bg-tertiary text-muted text-xs px-1.5 py-0.5 rounded font-medium">
                  #{data.cmc_rank || '--'}
                </span>
              </div>
              <span className="text-muted text-xs">
                {data.name} · Launched{' '}
                {data.date_added ? new Date(data.date_added).toISOString().split('T')[0] : '--'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={data.urls?.website?.[0] || '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 bg-tertiary hover:bg-hover px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="2" y1="12" x2="22" y2="12"></line>
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
              </svg>
              Website
            </a>
            <a
              href={data.urls?.explorer?.[0] || '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 bg-tertiary hover:bg-hover px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                <polyline points="15 3 21 3 21 9"></polyline>
                <line x1="10" y1="14" x2="21" y2="3"></line>
              </svg>
              Explorer
            </a>
          </div>
        </div>

        {/* Description */}
        <p className="text-muted text-sm leading-relaxed mb-8">
          {data.description || 'No description available.'}
        </p>

        {/* High/Low Cards */}
        <div className="flex gap-4 mb-8">
          <div className="flex-1 bg-secondary rounded-xl p-4 border border-color">
            <span className="text-muted text-xs block mb-2">All-time High</span>
            <span className="text-success text-lg font-bold block mb-1">
              ${ath.toLocaleString(undefined, { maximumFractionDigits: 4 })}
            </span>
            <span className="text-muted text-[10px]">{athDate}</span>
          </div>
          <div className="flex-1 bg-secondary rounded-xl p-4 border border-color">
            <span className="text-muted text-xs block mb-2">All-time Low</span>
            <span className="text-danger text-lg font-bold block mb-1">
              ${atl.toLocaleString(undefined, { maximumFractionDigits: 6 })}
            </span>
            <span className="text-muted text-[10px]">{atlDate}</span>
          </div>
        </div>

        <p className="text-[#6c757d] text-[10px] leading-relaxed">
          The above data is provided by CoinMarketCap for informational purposes only and does not
          constitute investment advice of any kind.
        </p>
      </div>

      {/* Right Column */}
      <div className="flex-1 p-6 min-w-[320px]">
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <span className="text-muted text-sm">Market Cap</span>
            <span className="font-semibold">{formatLargeNumber(marketCap)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted text-sm">Fully Diluted Market Cap</span>
            <span className="font-semibold">{formatLargeNumber(fdv)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted text-sm">24h Volume</span>
            <span className="font-semibold">{formatLargeNumber(vol24h)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted text-sm">Market Dominance</span>
            <span className="font-semibold">{dominance.toFixed(2)}%</span>
          </div>
          <div className="flex items-center justify-between mt-4">
            <span className="text-muted text-sm">Circulating Supply</span>
            <span className="font-semibold">{formatSupply(circSupply, coin)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted text-sm">Max Supply</span>
            <span className="font-semibold">{formatSupply(maxSupply, coin)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted text-sm">Total Supply</span>
            <span className="font-semibold">{formatSupply(totalSupply, coin)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted text-sm">Circulation Rate</span>
            <span className="text-success font-semibold">
              {circRate > 0 ? circRate.toFixed(2) + '%' : '--'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

const LeverageMarginView: React.FC<{ symbol: string }> = ({ symbol }) => {
  const [loading, setLoading] = useState(false);
  const [brackets, setBrackets] = useState<any[]>([]);

  useEffect(() => {
    const fetchBrackets = async () => {
      setLoading(true);
      try {
        const asterSymbol = symbol.replace('-', '');
        const data = await getBrackets();

        // Find the brackets for the current symbol
        const symbolBrackets = data.find((d: any) => d.symbol === asterSymbol);
        if (symbolBrackets && symbolBrackets.riskBrackets) {
          setBrackets(symbolBrackets.riskBrackets);
        } else {
          setBrackets([]);
        }
      } catch (e) {
        console.error('Failed to fetch brackets', e);
      } finally {
        setLoading(false);
      }
    };
    fetchBrackets();
  }, [symbol]);

  if (loading) {
    return (
      <div className="flex flex-col h-full w-full bg-secondary text-primary justify-center items-center">
        <span className="text-muted text-sm">Loading Leverage & Margin data...</span>
      </div>
    );
  }

  if (brackets.length === 0) {
    return (
      <div className="flex flex-col h-full w-full bg-secondary text-primary justify-center items-center">
        <span className="text-muted text-sm">No leverage data available for {symbol}.</span>
      </div>
    );
  }

  return (
    <div className="flex-1 w-full h-full overflow-y-auto bg-primary">
      <div className="min-w-max p-4">
        <div className="grid grid-cols-5 text-muted text-xs border-b border-color pb-2 mb-2 px-2 sticky top-0 bg-primary z-10">
          <div>Tier</div>
          <div>Position Bracket (Notional Value in USDT)</div>
          <div>Max Leverage</div>
          <div>Maintenance Margin Rate</div>
          <div>Maintenance Amount(USDT)</div>
        </div>
        {brackets.map((b: any) => (
          <div
            key={b.bracketSeq}
            className="grid grid-cols-5 text-sm py-3 px-2 hover:bg-secondary/50 rounded transition-colors items-center"
          >
            <div className="font-medium text-primary">{b.bracketSeq}</div>
            <div className="text-primary font-mono text-[13px]">
              {b.bracketNotionalFloor.toLocaleString()} - {b.bracketNotionalCap.toLocaleString()}
            </div>
            <div className="text-primary font-medium">{b.maxOpenPosLeverage}X</div>
            <div className="text-primary font-mono">
              {(b.bracketMaintenanceMarginRate * 100).toFixed(2)} %
            </div>
            <div className="text-primary font-mono">
              {b.cumFastMaintenanceAmount.toLocaleString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const FundingHistoryView: React.FC<{ symbol: string }> = ({ symbol }) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [now, setNow] = useState(Date.now());
  const [activeTab, setActiveTab] = useState<'realtime' | 'history'>('realtime');

  useEffect(() => {
    const fetchFunding = async () => {
      setLoading(true);
      try {
        const asterSymbol = symbol.replace('-', '');
        const res = await getRealTimeFundingRate(asterSymbol);
        setData(res);
      } catch (e) {
        console.error('Failed to fetch real-time funding', e);
      } finally {
        setLoading(false);
      }
    };
    fetchFunding();
  }, [symbol]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  if (loading && !data) {
    return (
      <div className="flex flex-col h-full w-full bg-secondary text-primary justify-center items-center">
        <span className="text-muted text-sm">Loading Funding History...</span>
      </div>
    );
  }

  const formatCountdown = (targetMs: number) => {
    const diff = targetMs - now;
    if (diff <= 0) return '00:00:00';
    const h = Math.floor(diff / (1000 * 60 * 60));
    const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const s = Math.floor((diff % (1000 * 60)) / 1000);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col h-full w-full bg-primary overflow-y-auto">
      <div className="flex items-center gap-4 px-6 py-4 border-b border-color shrink-0">
        <button
          onClick={() => setActiveTab('realtime')}
          className={`px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${
            activeTab === 'realtime'
              ? 'bg-secondary text-primary border border-color'
              : 'text-muted hover:text-primary'
          }`}
        >
          Real-Time Funding Rate
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${
            activeTab === 'history'
              ? 'bg-secondary text-primary border border-color'
              : 'text-muted hover:text-primary'
          }`}
        >
          Funding Rate History
        </button>
      </div>

      <div className="flex-1 flex flex-col p-6 min-h-0">
        {data && activeTab === 'realtime' && (
          <div className="mb-8 overflow-x-auto shrink-0">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead>
                <tr className="text-muted text-xs border-b border-color">
                  <th className="pb-3 font-normal pr-4">Contracts</th>
                  <th className="pb-3 font-normal pr-4">Interval</th>
                  <th className="pb-3 font-normal pr-4">Time to Next Funding</th>
                  <th className="pb-3 font-normal pr-4">Funding Rate</th>
                  <th className="pb-3 font-normal pr-4">Interest Rate</th>
                  <th className="pb-3 font-normal">Funding Cap/Floor</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-color/50">
                  <td className="py-4 font-medium">{data.symbol} Perpetual</td>
                  <td className="py-4">{data.fundingIntervalHours}h</td>
                  <td className="py-4 font-mono">{formatCountdown(data.nextFundingTime)}</td>
                  <td className="py-4 font-mono text-primary">
                    {(parseFloat(data.lastFundingRate) * 100).toFixed(4)}%
                  </td>
                  <td className="py-4 font-mono text-primary">
                    {(parseFloat(data.interestRate) * 100).toFixed(4)}%
                  </td>
                  <td className="py-4 font-mono text-primary">
                    {(data.fundingFeeCap * 100).toFixed(2)}% /{' '}
                    {(data.fundingFeeFloor * 100).toFixed(2)}%
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* We place FundingChart below the table when Real-Time is active, or as the main view when History is active */}
        <div className="flex-1 min-h-[300px] border border-color rounded-xl overflow-hidden bg-secondary">
          <FundingChart />
        </div>
      </div>
    </div>
  );
};

type SubTab = 'Token Information' | 'Trading Parameters' | 'Leverage & Margin' | 'Funding History';

export interface DetailsTabProps {
  activeChartTab?: 'price' | 'depth' | 'details';
  onChartTabChange?: (tab: 'price' | 'depth' | 'details') => void;
}

export const DetailsTab: React.FC<DetailsTabProps> = ({ activeChartTab, onChartTabChange }) => {
  const symbol = useMarketStore(state => state.selectedSymbol);
  const coin = symbol.split('-')[0] || 'BTC';

  const [activeSubTab, setActiveSubTab] = useState<SubTab>('Token Information');

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [athlData, setAthlData] = useState<any>(null);

  useEffect(() => {
    // Only fetch details if we are on the token info tab
    if (activeSubTab !== 'Token Information') return;

    const fetchData = async () => {
      setLoading(true);
      try {
        const [detail, athl] = await Promise.all([getSymbolDetail(coin), getSymbolAthl(coin)]);
        setData(detail);
        setAthlData(athl);
      } catch (e) {
        console.error('Failed to fetch symbol details', e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [coin, activeSubTab]);

  const tabs: SubTab[] = ['Token Information', 'Leverage & Margin', 'Funding History'];

  return (
    <div className="w-full h-full bg-secondary flex flex-col min-h-0 min-w-0 max-h-full max-w-full">
      {activeChartTab && onChartTabChange && (
        <div className="flex items-center justify-end px-4 py-1.5 border-b border-color bg-secondary shrink-0 z-50">
          <div className="flex items-center gap-3 text-[11px] text-muted">
            <button
              onClick={() => onChartTabChange('price')}
              className={`transition-colors hover:text-primary ${activeChartTab === 'price' ? 'text-primary font-medium' : ''}`}
            >
              Chart
            </button>
            <button
              onClick={() => onChartTabChange('depth')}
              className={`transition-colors hover:text-primary ${activeChartTab === 'depth' ? 'text-primary font-medium' : ''}`}
            >
              Depth
            </button>
            <button
              onClick={() => onChartTabChange('details')}
              className={`transition-colors hover:text-primary ${activeChartTab === 'details' ? 'text-primary font-medium' : ''}`}
            >
              Details
            </button>
          </div>
        </div>
      )}

      {/* Scrollable Container */}
      <div className="flex items-center gap-6 px-4 h-11 border-b border-color shrink-0 overflow-x-auto bg-primary">
        {tabs.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveSubTab(tab)}
            className={`h-full text-[11px] whitespace-nowrap px-1 transition-colors ${
              activeSubTab === tab
                ? 'text-primary font-medium border-b-2 border-brand'
                : 'text-muted hover:text-primary'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-hidden relative bg-primary">
        {activeSubTab === 'Token Information' &&
          (loading ? (
            <div className="flex flex-col h-full w-full justify-center items-center">
              <span className="text-muted text-sm">Loading details...</span>
            </div>
          ) : !data ? (
            <div className="flex flex-col h-full w-full justify-center items-center">
              <span className="text-muted text-sm">No details available for {coin}.</span>
            </div>
          ) : (
            <TokenInfoView symbol={symbol} coin={coin} data={data} athlData={athlData} />
          ))}

        {activeSubTab === 'Leverage & Margin' && <LeverageMarginView symbol={symbol} />}

        {activeSubTab === 'Funding History' && <FundingHistoryView symbol={symbol} />}

        {activeSubTab === 'Trading Parameters' && (
          <div className="flex flex-col h-full w-full justify-center items-center">
            <span className="text-muted text-sm">{activeSubTab} coming soon...</span>
          </div>
        )}
      </div>
    </div>
  );
};
