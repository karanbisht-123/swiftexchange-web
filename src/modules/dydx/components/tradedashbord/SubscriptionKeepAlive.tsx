import React from 'react';


import { useDydxData } from '../../hooks/useDydxData';
import { useOrderbook } from '../../hooks/useOrderbook';
import { useTrades } from '../../hooks/useTrades';
import useMarketStore from '../../store/marketStore';

const SubscriptionKeepAlive: React.FC = React.memo(() => {
  const { selectedMarket } = useMarketStore();

  useOrderbook(selectedMarket);
  useTrades(selectedMarket, 50);

  useDydxData();

  return null;
});

SubscriptionKeepAlive.displayName = 'SubscriptionKeepAlive';

export default SubscriptionKeepAlive;
