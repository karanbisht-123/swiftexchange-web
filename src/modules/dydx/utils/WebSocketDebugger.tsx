import React, { useEffect, useState } from 'react';

import { getSocketClient } from '../client/clients';

const WebSocketDebugger: React.FC = () => {
  const [debugInfo, setDebugInfo] = useState<any>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [connectionHistory, setConnectionHistory] = useState<
    Array<{
      timestamp: string;
      event: string;
      details?: any;
    }>
  >([]);

  useEffect(() => {
    const socket = getSocketClient();
    const interval = setInterval(() => {
      setDebugInfo(socket.getDebugInfo());
    }, 1000);

    // Track connection events
    const onConnectCleanup = socket.onConnect(() => {
      setConnectionHistory(prev =>
        [
          ...prev,
          {
            timestamp: new Date().toISOString(),
            event: 'CONNECTED',
          },
        ].slice(-20)
      ); // Keep last 20 events
    });

    const onDisconnectCleanup = socket.onDisconnect(() => {
      setConnectionHistory(prev =>
        [
          ...prev,
          {
            timestamp: new Date().toISOString(),
            event: 'DISCONNECTED',
          },
        ].slice(-20)
      );
    });

    return () => {
      clearInterval(interval);
      onConnectCleanup();
      onDisconnectCleanup();
    };
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
    <div className="fixed bottom-4 right-4 bg-white border-2 border-gray-300 rounded-lg shadow-xl p-4 max-w-2xl w-full z-50 max-h-[80vh] overflow-y-auto">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-bold text-gray-800">WebSocket Debug</h3>
        <button onClick={() => setIsVisible(false)} className="text-gray-500 hover:text-gray-700">
          ✕
        </button>
      </div>

      {debugInfo && (
        <div className="space-y-4 text-sm">
          {/* Connection Status Section */}
          <div className="border-b pb-3">
            <h4 className="font-semibold text-gray-700 mb-2">Connection Status</h4>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Status:</span>
                <span
                  className={`font-semibold px-2 py-1 rounded ${
                    debugInfo.connectionStatus === 'connected'
                      ? 'bg-green-100 text-green-700'
                      : debugInfo.connectionStatus === 'connecting'
                        ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-red-100 text-red-700'
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
                <span className="text-gray-600">WebSocket URL:</span>
                <span className="font-mono text-xs text-gray-800 truncate max-w-xs">
                  {debugInfo.currentWsUrl || 'N/A'}
                </span>
              </div>
            </div>
          </div>

          {/* Heartbeat Section */}
          <div className="border-b pb-3">
            <h4 className="font-semibold text-gray-700 mb-2">Heartbeat & Activity</h4>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Last Heartbeat:</span>
                <span
                  className={`font-semibold ${
                    debugInfo.timeSinceLastHeartbeat > 60000 ? 'text-red-600' : 'text-green-600'
                  }`}
                >
                  {debugInfo.timeSinceLastHeartbeat}ms ago
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-gray-600">Last Message:</span>
                <span className="font-mono text-xs text-gray-800">{debugInfo.lastHeartbeat}</span>
              </div>
            </div>
          </div>

          {/* Reconnection Section */}
          <div className="border-b pb-3">
            <h4 className="font-semibold text-gray-700 mb-2">Reconnection Info</h4>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Reconnect Attempts:</span>
                <span className="font-semibold text-gray-800">{debugInfo.reconnectAttempts}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-gray-600">Is Reconnecting:</span>
                <span
                  className={`font-semibold ${
                    debugInfo.isReconnecting ? 'text-yellow-600' : 'text-gray-800'
                  }`}
                >
                  {debugInfo.isReconnecting ? 'Yes' : 'No'}
                </span>
              </div>
            </div>
          </div>

          {/* Queue Section */}
          <div className="border-b pb-3">
            <h4 className="font-semibold text-gray-700 mb-2">Message Queues</h4>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Message Queue:</span>
                <span className="font-semibold text-gray-800">{debugInfo.messageQueueLength}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-gray-600">Pending Handler Calls:</span>
                <span className="font-semibold text-gray-800">{debugInfo.pendingHandlerCalls}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-gray-600">Active Handlers:</span>
                <span className="font-semibold text-gray-800">{debugInfo.activeHandlerCount}</span>
              </div>
            </div>
          </div>

          {/* Subscriptions Section */}
          <div className="border-b pb-3">
            <h4 className="font-semibold text-gray-700 mb-2">
              Active Subscriptions ({debugInfo.subscriptions.length})
            </h4>
            <div className="max-h-32 overflow-y-auto bg-gray-50 rounded p-2">
              {debugInfo.subscriptions.length > 0 ? (
                debugInfo.subscriptions.map((sub: string, idx: number) => (
                  <div key={idx} className="text-xs font-mono text-gray-700 py-0.5">
                    • {sub}
                  </div>
                ))
              ) : (
                <div className="text-xs text-gray-400">No subscriptions</div>
              )}
            </div>
          </div>

          {/* Pending Subscriptions Section */}
          <div className="border-b pb-3">
            <h4 className="font-semibold text-gray-700 mb-2">
              Pending Subscriptions ({debugInfo.pendingSubscriptions.length})
            </h4>
            <div className="max-h-32 overflow-y-auto bg-gray-50 rounded p-2">
              {debugInfo.pendingSubscriptions.length > 0 ? (
                debugInfo.pendingSubscriptions.map((sub: string, idx: number) => (
                  <div key={idx} className="text-xs font-mono text-gray-700 py-0.5">
                    • {sub}
                  </div>
                ))
              ) : (
                <div className="text-xs text-gray-400">No pending</div>
              )}
            </div>
          </div>

          {/* Connection History */}
          <div>
            <h4 className="font-semibold text-gray-700 mb-2">Connection History (Last 20)</h4>
            <div className="max-h-40 overflow-y-auto bg-gray-50 rounded p-2">
              {connectionHistory.length > 0 ? (
                connectionHistory
                  .slice()
                  .reverse()
                  .map((event, idx) => (
                    <div
                      key={idx}
                      className="text-xs font-mono text-gray-700 py-1 border-b last:border-b-0"
                    >
                      <span
                        className={`font-semibold ${
                          event.event === 'CONNECTED' ? 'text-green-600' : 'text-red-600'
                        }`}
                      >
                        {event.event}
                      </span>
                      <span className="text-gray-500 ml-2">
                        {new Date(event.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  ))
              ) : (
                <div className="text-xs text-gray-400">No events yet</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WebSocketDebugger;
