import { useEffect } from 'react';

import { getSocketClient } from '../../client/clients';

const OrderbookLogger = () => {
  useEffect(() => {
    const socketClient = getSocketClient();
    let unsubscribe: (() => void) | null = null;

    const connectAndSubscribe = async () => {
      try {

        await socketClient.connect();
        console.log(' WebSocket connected successfully');
        const market = 'BTC-USD';

        unsubscribe = socketClient.subscribeToOrderbook(market, data => {
          console.log(' Orderbook Data Received:', {
            channel: data.channel,
            market: data.id,
            messageId: data.message_id,
            timestamp: new Date().toISOString(),
            contents: data.contents,
          });
          if (data.contents) {
            console.log('Bids:', data.contents.bids?.slice(0, 5));
            console.log('Asks:', data.contents.asks?.slice(0, 5));
          }
        });

        console.log(`Subscribed to orderbook for market: ${market}`);
      } catch (error) {
        console.error('Connection error:', error);
      }
    };

    connectAndSubscribe();
    return () => {
      if (unsubscribe) {
        unsubscribe();
        console.log('Unsubscribed from orderbook');
      }

      console.log('WebSocket disconnected');
    };
  }, []);

  return (
    <div style={{ padding: '20px' }}>
      <h2>Orderbook Logger</h2>
      <p>Check the browser console to see orderbook data</p>
      <p>Status: Check console for connection status</p>
    </div>
  );
};

export default OrderbookLogger;
