import React, { useState, useEffect } from 'react';
import { Notification } from './common/Notification';

export const NetworkMonitor: React.FC = () => {
    const [latency, setLatency] = useState<number | null>(null);
    const [isSlow, setIsSlow] = useState(false);

    // Check latency every 10 seconds
    useEffect(() => {
        const checkLatency = async () => {
            const start = Date.now();
            try {
                // Fetch current origin with cache busting to measure RTT
                await fetch(window.location.origin + '/?_t=' + start, {
                    method: 'HEAD',
                    cache: 'no-store'
                });
                const end = Date.now();
                const rtt = end - start;
                setLatency(rtt);

                // Consider slow if RTT > 1500ms
                setIsSlow(rtt > 1500);
            } catch (error) {
                // If fetch fails, we might be offline or extremely slow
                // console.error("Network check failed", error);
                setIsSlow(true);
            }
        };

        // Initial check
        checkLatency();

        const interval = setInterval(checkLatency, 10000);
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
                // No onClose so it persists until network improves? 
                // Or allow close but it might reappear. Let's allow close for UX.
                onClose={() => setIsSlow(false)}
                autoClose={false}
            />
        </div>
    );
};
