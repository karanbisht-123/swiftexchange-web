import { usePositionStore } from '../../core/stores/positionStore';
import { useOrderStore } from '../../core/stores/orderStore';
import { useAccountStore } from '../../core/stores/accountStore';

export interface AsterUserDataWebSocketOptions {
  url: string;
  listenKey: string;
}

export class AsterUserDataWebSocket {
  private url: string;
  private listenKey: string;
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isConnecting = false;
  private shouldReconnect = true;

  constructor(options: AsterUserDataWebSocketOptions) {
    this.url = options.url;
    this.listenKey = options.listenKey;
  }

  public async connect(): Promise<void> {
    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    this.isConnecting = true;
    this.shouldReconnect = true;

    return new Promise((resolve, reject) => {
      try {
        const fullUrl = `${this.url}/${this.listenKey}`;
        this.ws = new WebSocket(fullUrl);

        this.ws.onopen = () => {
          this.isConnecting = false;
          console.log(`[Aster UserData WS] Connected: ${fullUrl}`);
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            this.handleMessage(data);
          } catch (e) {
            console.error('[Aster UserData WS] Failed to parse message', e);
          }
        };

        this.ws.onclose = () => {
          this.isConnecting = false;
          this.ws = null;
          console.log('[Aster UserData WS] Disconnected');
          this.attemptReconnect();
        };

        this.ws.onerror = (error) => {
          console.error('[Aster UserData WS] Error', error);
          // reject(error); // Only reject if we want to fail the initial connection
        };
      } catch (error) {
        this.isConnecting = false;
        reject(error);
      }
    });
  }

  public disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private attemptReconnect(): void {
    if (!this.shouldReconnect) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);

    this.reconnectTimer = setTimeout(() => {
      console.log('[Aster UserData WS] Attempting to reconnect...');
      this.connect();
    }, 5000);
  }

  private handleMessage(data: any): void {
    const eventType = data.e;

    switch (eventType) {
      case 'ACCOUNT_UPDATE':
        this.handleAccountUpdate(data.a);
        break;
      case 'ORDER_TRADE_UPDATE':
        this.handleOrderUpdate(data.o);
        break;
      case 'listenKeyExpired':
        console.warn('[Aster UserData WS] ListenKey Expired! Must request a new one and reconnect.');
        // TODO: Request new listenKey from REST API in Phase 2
        this.disconnect();
        break;
      case 'MARGIN_CALL':
        console.warn('[Aster UserData WS] Margin Call!', data);
        break;
      default:
        // Other events ignored
        break;
    }
  }

  private handleAccountUpdate(accountData: any): void {
    // Balances
    if (accountData.B && Array.isArray(accountData.B)) {
      const balances = accountData.B.map((b: any) => ({
        asset: b.a,
        total: String(b.wb),
        available: String(b.cw), // Cross Wallet Balance is usually used as available
        locked: String(Number(b.wb) - Number(b.cw)),
      }));
      // We could useAccountStore.getState().setBalances or update existing ones
      // For now, let's just log them or update store if we want to merge
      const store = useAccountStore.getState();
      balances.forEach((b: any) => store.updateBalance(b));
    }

    // Positions
    if (accountData.P && Array.isArray(accountData.P)) {
      const positions = accountData.P.map((p: any) => {
        const symbol = p.s.replace('USDT', '-USDT');
        return {
          symbol,
          size: String(p.pa),
          entryPrice: String(p.ep),
          markPrice: '0', // Not always provided in WS, should retain existing or update via public ticker
          liquidationPrice: '0',
          unrealizedPnl: String(p.up),
          leverage: 20, // Not explicitly in this event
          marginType: p.mt === 'isolated' ? 'isolated' : 'cross',
          isolatedMargin: String(p.iw || '0'),
        };
      });
      const store = usePositionStore.getState();
      // Filter out closed positions (size = 0) and remove them from store, or just update
      positions.forEach((p: any) => {
        if (parseFloat(p.size) === 0) {
          // You could delete it from the store if it reaches 0
          // For now we just update it so the UI shows 0
        }
        store.updatePosition(p);
      });
    }
  }

  private handleOrderUpdate(orderData: any): void {
    const symbol = orderData.s.replace('USDT', '-USDT');
    const order: import('../../core/models').Order = {
      id: String(orderData.i),
      symbol,
      type: orderData.ot.toLowerCase() as any,
      side: orderData.S.toLowerCase() as any,
      price: String(orderData.p),
      size: String(orderData.q),
      filledSize: String(orderData.z),
      status: orderData.X.toLowerCase() as any,
      reduceOnly: orderData.R || false,
      timestamp: orderData.T || Date.now(),
    };

    const store = useOrderStore.getState();

    if (['filled', 'canceled', 'rejected', 'expired'].includes(order.status)) {
      store.removeOrder(order.id);
    } else {
      store.updateOrder(order);
    }
  }
}
