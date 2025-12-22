import { useEffect, useState } from 'react';

import { type SubaccountData, localStateManager } from '../utils/localStateManager';

export const useLocalState = () => {
  const [state, setState] = useState<SubaccountData>(localStateManager.getState());

  useEffect(() => {
    const unsubscribe = localStateManager.subscribe(newData => {
      setState(newData);
    });

    return () => unsubscribe();
  }, []);

  return state;
};
