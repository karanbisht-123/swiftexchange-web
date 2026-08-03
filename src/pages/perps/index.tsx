import React from 'react';
import { ExchangeLayout } from '../../perps/components/layout';
import { useDynamicExchange } from '../../perps/hooks/useDynamicExchange';

const PerpetualsTradingPage: React.FC = () => {
  useDynamicExchange();

  return (
    <ExchangeLayout />
  );
};

export default PerpetualsTradingPage;
