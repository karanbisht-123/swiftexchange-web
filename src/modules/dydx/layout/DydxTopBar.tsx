import { type FC } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { ROUTES } from '../../../constants/routes';
import { useApiTradingKeys } from '../../walletconnect/hooks/useWalletConnect';
import { useWalletStore } from '../../walletconnect/store/walletConnectStore';

interface TabItem {
  key: string;
  label: string;
}

const DydxTopBar: FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const activeTab = searchParams.get('view') || 'trade';

  const hasDydx = useWalletStore(
    state =>
      !!(state.connectedWallets.evm?.dydxAddress || state.connectedWallets.cosmos?.dydxAddress)
  );
  const { openModal } = useApiTradingKeys();
  const openExportPhraseModal = useWalletStore(state => state.openExportPhraseModal);

  const tabs: TabItem[] = [
    {
      key: 'trade',
      label: 'Trade',
    },
    {
      key: 'markets',
      label: 'Markets',
    },
    {
      key: 'portfolio',
      label: 'Portfolio',
    },
  ];

  const handleTabClick = (tabKey: string) => {
    navigate(`${ROUTES.TRADING_DYDX_FUTURES}?view=${tabKey}`);
  };

  return (
    <div className="w-full bg-secondary hidden lg:block my-1.5 overflow-x-auto scrollbar-hide rounded-md py-1  px-2">
      <div className="flex items-center justify-between gap-4  min-w-max">
        <div className="flex items-center gap-1">
          {tabs.map(tab => {
            const isActive = activeTab === tab.key;

            return (
              <button
                key={tab.key}
                onClick={() => handleTabClick(tab.key)}
                className={`
                  flex items-center gap-2 px-4 py-2 rounded-md
                  transition-all duration-150 font-medium text-sm
                  ${isActive ? 'text-white' : 'text-primary hover:bg-tertiary'}
                `}
                style={{
                  backgroundColor: isActive ? 'var(--color-brand-primary)' : 'transparent',
                }}
              >
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {hasDydx && (
          <div className="flex items-center gap-1 h-full py-1">
            <button
              onClick={openModal}
              className="px-4 rounded-md py-2 bg-brand text-white text-xs font-bold hover:opacity-90 active:opacity-80 transition-all shadow-sm "
            >
              API Trading Keys
            </button>
            <button
              onClick={openExportPhraseModal}
              style={{
                borderColor: 'var(--color-border)',
                color: 'var(--color-text-primary)',
              }}
              className="px-4 py-2 rounded-md border text-xs font-bold hover:bg-[var(--color-bg-hover)] active:opacity-80 transition-all shadow-sm "
            >
              Export Phrase
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default DydxTopBar;
