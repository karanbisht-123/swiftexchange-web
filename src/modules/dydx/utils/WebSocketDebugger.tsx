import React, { useEffect, useState } from 'react';

import { getSocketClient } from '../client/clients';

const WebSocketDebugger: React.FC = () => {
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const socket = getSocketClient();
    const interval = setInterval(() => {
      setDebugInfo(socket.getDebugInfo());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  if (!isVisible) {
    return (
      <button
        onClick={() => setIsVisible(true)}
        className="fixed bottom-4 right-4 bg-blue-500 text-white px-4 py-2 rounded-lg shadow-lg hover:bg-blue-600 transition-colors z-50"
      >
        Show Debug Info
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 bg-white border-2 border-gray-300 rounded-lg shadow-xl p-4 max-w-md w-full z-50">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-bold text-gray-800">WebSocket Debug</h3>
        <button onClick={() => setIsVisible(false)} className="text-gray-500 hover:text-gray-700">
          ✕
        </button>
      </div>

      {debugInfo && (
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-gray-600">Status:</span>
            <span
              className={`font-semibold ${
                debugInfo.connectionStatus === 'connected'
                  ? 'text-green-600'
                  : debugInfo.connectionStatus === 'connecting'
                    ? 'text-yellow-600'
                    : 'text-red-600'
              }`}
            >
              {debugInfo.connectionStatus.toUpperCase()}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-gray-600">Connection ID:</span>
            <span className="font-mono text-xs text-gray-800">
              {debugInfo.connectionId || 'N/A'}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-gray-600">Reconnect Attempts:</span>
            <span className="font-semibold text-gray-800">{debugInfo.reconnectAttempts}</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-gray-600">Is Reconnecting:</span>
            <span className="font-semibold text-gray-800">
              {debugInfo.isReconnecting ? 'Yes' : 'No'}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-gray-600">Message Queue:</span>
            <span className="font-semibold text-gray-800">{debugInfo.messageQueueLength}</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-gray-600">Last Heartbeat:</span>
            <span className="font-mono text-xs text-gray-800">
              {debugInfo.timeSinceLastHeartbeat}ms ago
            </span>
          </div>

          <div className="border-t pt-2 mt-2">
            <div className="text-gray-600 font-semibold mb-1">
              Active Subscriptions ({debugInfo.subscriptions.length}):
            </div>
            <div className="max-h-32 overflow-y-auto bg-gray-50 rounded p-2">
              {debugInfo.subscriptions.length > 0 ? (
                debugInfo.subscriptions.map((sub: string, idx: number) => (
                  <div key={idx} className="text-xs font-mono text-gray-700">
                    • {sub}
                  </div>
                ))
              ) : (
                <div className="text-xs text-gray-400">No subscriptions</div>
              )}
            </div>
          </div>

          <div className="border-t pt-2 mt-2">
            <div className="text-gray-600 font-semibold mb-1">
              Pending Subscriptions ({debugInfo.pendingSubscriptions.length}):
            </div>
            <div className="max-h-32 overflow-y-auto bg-gray-50 rounded p-2">
              {debugInfo.pendingSubscriptions.length > 0 ? (
                debugInfo.pendingSubscriptions.map((sub: string, idx: number) => (
                  <div key={idx} className="text-xs font-mono text-gray-700">
                    • {sub}
                  </div>
                ))
              ) : (
                <div className="text-xs text-gray-400">No pending</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WebSocketDebugger;
