import React from 'react';
import { ExchangeLayout } from '../../modules/perps/components/layout';
import { useDynamicExchange } from '../../modules/perps/hooks/useDynamicExchange';

const PerpetualsTradingPage: React.FC = () => {
  useDynamicExchange();

  return (
    <ExchangeLayout />
  );
};

export default PerpetualsTradingPage;
