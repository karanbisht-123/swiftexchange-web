import { CompositeClient } from '@dydxprotocol/v4-client-js';

const BLOCK_TIME_MS = 1080;
const REFRESH_INTERVAL_MS = 15000;

class DydxBlockHeightService {
  private height = 0;
  private lastFetchedAt = 0;
  private refreshInFlight: Promise<number> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  start(client: CompositeClient) {
    if (this.timer) return;
    this.refresh(client);
    this.timer = setInterval(() => this.refresh(client), REFRESH_INTERVAL_MS);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async refresh(client: CompositeClient): Promise<number> {
    if (this.refreshInFlight) return this.refreshInFlight;
    this.refreshInFlight = client.validatorClient.get
      .latestBlockHeight()
      .then((h: number) => {
        this.height = h;
        this.lastFetchedAt = Date.now();
        return h;
      })
      .finally(() => {
        this.refreshInFlight = null;
      });
    return this.refreshInFlight;
  }

  getEstimatedHeight(): number {
    if (this.height === 0) return 0;
    const elapsedBlocks = Math.floor((Date.now() - this.lastFetchedAt) / BLOCK_TIME_MS);
    return this.height + elapsedBlocks;
  }

  async forceRefresh(client: CompositeClient): Promise<number> {
    return this.refresh(client);
  }
}

export const dydxBlockHeightService = new DydxBlockHeightService();
