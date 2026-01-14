import { useEffect } from 'react';

import { getSocketClient } from '../../client/clients';

const OrderbookLogger = () => {
  useEffect(() => {
    const socketClient = getSocketClient();
    let unsubscribe: (() => void) | null = null;

    const connectAndSubscribe = async () => {
      try {
        // Connect to WebSocket
        await socketClient.connect();
        console.log('✅ WebSocket connected successfully');

        // Subscribe to orderbook for a specific market (e.g., BTC-USD)
        const market = 'BTC-USD';

        unsubscribe = socketClient.subscribeToOrderbook(market, data => {
          console.log('📊 Orderbook Data Received:', {
            channel: data.channel,
            market: data.id,
            messageId: data.message_id,
            timestamp: new Date().toISOString(),
            contents: data.contents,
          });

          // Pretty print the orderbook data
          if (data.contents) {
            console.log('Bids:', data.contents.bids?.slice(0, 5)); // Top 5 bids
            console.log('Asks:', data.contents.asks?.slice(0, 5)); // Top 5 asks
          }
        });

        console.log(`📡 Subscribed to orderbook for market: ${market}`);
      } catch (error) {
        console.error('❌ Connection error:', error);
      }
    };

    // Start connection
    connectAndSubscribe();

    // Cleanup on unmount
    return () => {
      if (unsubscribe) {
        unsubscribe();
        console.log('🔌 Unsubscribed from orderbook');
      }
      // socketClient.disconnect();
      console.log('🔌 WebSocket disconnected');
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
