import React from 'react';

import { useRealtimeChart } from '../../hooks/useCandles';
import { useDydxData } from '../../hooks/useDydxData';
import { useOrderbook } from '../../hooks/useOrderbook';
import { useTrades } from '../../hooks/useTrades';
import useMarketStore from '../../store/marketStore';

const SubscriptionKeepAlive: React.FC = React.memo(() => {
  const { selectedMarket } = useMarketStore();

  useOrderbook(selectedMarket);
  useTrades(selectedMarket, 50);
  useRealtimeChart(selectedMarket, '15MINS', 1000);
  useDydxData();

  return null;
});

SubscriptionKeepAlive.displayName = 'SubscriptionKeepAlive';

export default SubscriptionKeepAlive;
