import { beforeEach, describe, expect, it } from 'vitest';

import useOrderPreviewStore from '../orderPreviewStore';

describe('orderPreviewStore', () => {
  beforeEach(() => {
    useOrderPreviewStore.setState({
      pendingMarginRequired: 0,
    });
  });

  it('sets pending margin requirement and clears it correctly', () => {
    const store = useOrderPreviewStore.getState();
    store.setPendingMargin(120.5);
    expect(useOrderPreviewStore.getState().pendingMarginRequired).toBe(120.5);

    store.clearPendingMargin();
    expect(useOrderPreviewStore.getState().pendingMarginRequired).toBe(0);
  });
});
