import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useOrderbookClickStore } from '../orderbookClickStore';

describe('orderbookClickStore', () => {
  beforeEach(() => {
    useOrderbookClickStore.setState({
      onPriceClick: null,
    });
  });

  it('sets and executes price click handler correctly', () => {
    const handler = vi.fn();
    const store = useOrderbookClickStore.getState();
    store.setOnPriceClick(handler);

    const registered = useOrderbookClickStore.getState().onPriceClick;
    expect(registered).toBe(handler);

    registered!('55000');
    expect(handler).toHaveBeenCalledWith('55000');
  });
});
