import React, { useEffect, useState } from 'react';

import { Notification } from '@/components/common/Notification';

export const NetworkMonitor: React.FC = () => {
  const [latency, setLatency] = useState<number | null>(null);
  const [isSlow, setIsSlow] = useState(false);
  useEffect(() => {
    const checkLatency = async () => {
      const start = Date.now();
      try {
        await fetch(window.location.origin + '/?_t=' + start, {
          method: 'HEAD',
          cache: 'no-store',
        });
        const end = Date.now();
        const rtt = end - start;
        setLatency(rtt);
        setIsSlow(rtt > 1500);
      } catch (error) {
        if (!navigator.onLine) {
          console.warn('User is offline');
        } else {
          console.error('Latency check failed:', error);
        }
        setIsSlow(true);
      }
    };
    checkLatency();

    const interval = setInterval(checkLatency, 20000);
    return () => clearInterval(interval);
  }, []);

  if (!isSlow) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm animate-bounce-in">
      <Notification
        type="warning"
        title="Slow Network Detected"
        message={`Your connection seems unstable (${latency ? latency + 'ms' : 'Offline'}). Trade updates may be delayed.`}
        className="shadow-2xl border-yellow-500"
        onClose={() => setIsSlow(false)}
        autoClose={false}
      />
    </div>
  );
};
