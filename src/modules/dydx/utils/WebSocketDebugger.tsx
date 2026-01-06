import { Activity, AlertCircle, CheckCircle, Radio, XCircle, Zap } from 'lucide-react';
import React, { useEffect, useState } from 'react';

import { getSocketClient } from '../client/clients';

const WebSocketDebugger = () => {
  const [debugInfo, setDebugInfo] = useState(null);
  const [isVisible, setIsVisible] = useState(false);
  const [connectionHistory, setConnectionHistory] = useState([]);
  const [selectedTab, setSelectedTab] = useState('overview');

  useEffect(() => {
    const socket = getSocketClient();
    const interval = setInterval(() => {
      setDebugInfo(socket.getDebugInfo());
    }, 1000);

    const onConnectCleanup = socket.onConnect(() => {
      setConnectionHistory(prev =>
        [
          ...prev,
          {
            timestamp: new Date().toISOString(),
            event: 'CONNECTED',
          },
        ].slice(-20)
      );
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
        className="fixed bottom-4 right-4 bg-gradient-to-r from-blue-500 to-purple-600 text-white px-4 py-2 rounded-lg shadow-lg hover:shadow-xl transition-all z-50 flex items-center gap-2"
      >
        <Activity size={18} />
        WebSocket Debug
      </button>
    );
  }

  const getStatusIcon = status => {
    switch (status) {
      case 'connected':
        return <CheckCircle className="text-green-500" size={20} />;
      case 'connecting':
        return <Radio className="text-yellow-500 animate-pulse" size={20} />;
      default:
        return <XCircle className="text-red-500" size={20} />;
    }
  };

  const formatTime = ms => {
    if (!ms) return 'Never';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  const getActivityStatus = lastMessageAgo => {
    if (!lastMessageAgo) return { color: 'text-gray-400', label: 'No data' };
    if (lastMessageAgo < 1000) return { color: 'text-green-500', label: 'Active' };
    if (lastMessageAgo < 5000) return { color: 'text-yellow-500', label: 'Recent' };
    if (lastMessageAgo < 30000) return { color: 'text-orange-500', label: 'Idle' };
    return { color: 'text-red-500', label: 'Stale' };
  };

  return (
    <div className="fixed bottom-4 right-4 bg-white border border-gray-200 rounded-xl shadow-2xl max-w-3xl w-full z-50 max-h-[85vh] overflow-hidden flex flex-col">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-500 to-purple-600 text-white p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Activity size={24} />
          <div>
            <h3 className="text-lg font-bold">WebSocket Debugger</h3>
            <p className="text-xs opacity-90">Real-time connection monitoring</p>
          </div>
        </div>
        <button
          onClick={() => setIsVisible(false)}
          className="hover:bg-white/20 p-2 rounded-lg transition-colors"
        >
          ✕
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b bg-gray-50">
        {['overview', 'subscriptions', 'performance', 'history'].map(tab => (
          <button
            key={tab}
            onClick={() => setSelectedTab(tab)}
            className={`px-4 py-3 text-sm font-medium transition-colors ${
              selectedTab === tab
                ? 'border-b-2 border-blue-500 text-blue-600 bg-white'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {debugInfo && (
          <>
            {/* Overview Tab */}
            {selectedTab === 'overview' && (
              <div className="space-y-4">
                {/* Connection Status Card */}
                <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-lg p-4 border border-blue-100">
                  <div className="flex items-center gap-2 mb-3">
                    {getStatusIcon(debugInfo.connectionStatus)}
                    <h4 className="font-semibold text-gray-800">Connection Status</h4>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-gray-600">Status:</span>
                      <span className="ml-2 font-semibold">
                        {debugInfo.connectionStatus.toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-600">Connection ID:</span>
                      <span className="ml-2 font-mono text-xs">
                        {debugInfo.connectionId || 'N/A'}
                      </span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-gray-600">Endpoint:</span>
                      <div className="mt-1 font-mono text-xs bg-white p-2 rounded border break-all">
                        {debugInfo.currentWsUrl || 'N/A'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-green-50 rounded-lg p-3 border border-green-200">
                    <div className="text-2xl font-bold text-green-600">
                      {debugInfo.totalMessagesReceived}
                    </div>
                    <div className="text-xs text-gray-600 mt-1">Total Messages</div>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
                    <div className="text-2xl font-bold text-blue-600">
                      {debugInfo.activeHandlerCount}
                    </div>
                    <div className="text-xs text-gray-600 mt-1">Active Handlers</div>
                  </div>
                  <div className="bg-purple-50 rounded-lg p-3 border border-purple-200">
                    <div className="text-2xl font-bold text-purple-600">
                      {debugInfo.serverSubscriptions.length}
                    </div>
                    <div className="text-xs text-gray-600 mt-1">Subscriptions</div>
                  </div>
                </div>

                {/* Ping/Pong Status */}
                <div className="bg-gray-50 rounded-lg p-4 border">
                  <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                    <Zap size={18} />
                    Heartbeat Status
                  </h4>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Ping Active:</span>
                      <span
                        className={
                          debugInfo.pingActive ? 'text-green-600 font-semibold' : 'text-red-600'
                        }
                      >
                        {debugInfo.pingActive ? 'Yes' : 'No'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Last Pong:</span>
                      <span
                        className={
                          debugInfo.pongReceived
                            ? 'text-green-600 font-semibold'
                            : 'text-yellow-600'
                        }
                      >
                        {debugInfo.pongReceived ? 'Received' : 'Waiting...'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Missed Pongs:</span>
                      <span
                        className={`font-semibold ${debugInfo.missedPongs > 0 ? 'text-red-600' : 'text-green-600'}`}
                      >
                        {debugInfo.missedPongs}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Reconnect Attempts:</span>
                      <span className="font-semibold">{debugInfo.reconnectAttempts}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Subscriptions Tab */}
            {selectedTab === 'subscriptions' && (
              <div className="space-y-3">
                <h4 className="font-semibold text-gray-800 flex items-center gap-2">
                  <Radio size={18} />
                  Live Subscription Activity ({debugInfo.subscriptionActivity?.length || 0})
                </h4>

                {debugInfo.subscriptionActivity && debugInfo.subscriptionActivity.length > 0 ? (
                  debugInfo.subscriptionActivity.map((sub, idx) => {
                    const status = getActivityStatus(sub.lastMessageAgo);
                    return (
                      <div
                        key={idx}
                        className="bg-white rounded-lg p-4 border border-gray-200 hover:shadow-md transition-shadow"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm font-semibold text-gray-800">
                                {sub.key}
                              </span>
                              <span
                                className={`text-xs px-2 py-1 rounded-full ${status.color} bg-opacity-10`}
                              >
                                {status.label}
                              </span>
                            </div>
                          </div>
                          <div
                            className={`w-3 h-3 rounded-full ${sub.isActive ? 'bg-green-500' : 'bg-gray-300'} animate-pulse`}
                          />
                        </div>

                        <div className="grid grid-cols-4 gap-2 text-xs mt-3">
                          <div>
                            <div className="text-gray-500">Last Message</div>
                            <div className="font-semibold text-gray-800 mt-1">
                              {formatTime(sub.lastMessageAgo)} ago
                            </div>
                          </div>
                          <div>
                            <div className="text-gray-500">Total</div>
                            <div className="font-semibold text-gray-800 mt-1">
                              {sub.totalMessages}
                            </div>
                          </div>
                          <div>
                            <div className="text-gray-500">Handlers</div>
                            <div className="font-semibold text-gray-800 mt-1">
                              {sub.handlerCount}
                            </div>
                          </div>
                          <div>
                            <div className="text-gray-500">Errors</div>
                            <div
                              className={`font-semibold mt-1 ${sub.errors > 0 ? 'text-red-600' : 'text-green-600'}`}
                            >
                              {sub.errors}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-8 text-gray-400">
                    <Radio size={48} className="mx-auto mb-2 opacity-50" />
                    <p>No active subscriptions</p>
                  </div>
                )}

                {/* Pending Subscriptions */}
                {debugInfo.pendingSubscriptions.length > 0 && (
                  <div className="mt-4">
                    <h5 className="text-sm font-semibold text-gray-600 mb-2">Pending</h5>
                    <div className="bg-yellow-50 rounded-lg p-3 border border-yellow-200">
                      {debugInfo.pendingSubscriptions.map((sub, idx) => (
                        <div key={idx} className="text-xs font-mono text-gray-700 py-1">
                          ⏳ {sub}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Performance Tab */}
            {selectedTab === 'performance' && (
              <div className="space-y-4">
                <div className="bg-gradient-to-br from-green-50 to-blue-50 rounded-lg p-4 border">
                  <h4 className="font-semibold text-gray-800 mb-3">Message Distribution</h4>
                  {debugInfo.messagesByChannel &&
                    Object.entries(debugInfo.messagesByChannel).map(([channel, count]) => (
                      <div key={channel} className="mb-2">
                        <div className="flex justify-between text-sm mb-1">
                          <span className="font-mono text-gray-700">{channel}</span>
                          <span className="font-semibold text-gray-800">{count}</span>
                        </div>
                        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-blue-500 to-purple-500"
                            style={{ width: `${(count / debugInfo.totalMessagesReceived) * 100}%` }}
                          />
                        </div>
                      </div>
                    ))}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white rounded-lg p-4 border">
                    <div className="text-gray-600 text-sm mb-1">Message Queue</div>
                    <div className="text-2xl font-bold text-gray-800">
                      {debugInfo.messageQueueLength}
                    </div>
                  </div>
                  <div className="bg-white rounded-lg p-4 border">
                    <div className="text-gray-600 text-sm mb-1">Pending Calls</div>
                    <div className="text-2xl font-bold text-gray-800">
                      {debugInfo.pendingHandlerCalls}
                    </div>
                  </div>
                  <div className="bg-white rounded-lg p-4 border">
                    <div className="text-gray-600 text-sm mb-1">Cache Size</div>
                    <div className="text-2xl font-bold text-gray-800">{debugInfo.cacheSize}</div>
                  </div>
                  <div className="bg-white rounded-lg p-4 border">
                    <div className="text-gray-600 text-sm mb-1">Active Throttles</div>
                    <div className="text-2xl font-bold text-gray-800">
                      {debugInfo.activeThrottles}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* History Tab */}
            {selectedTab === 'history' && (
              <div className="space-y-3">
                <h4 className="font-semibold text-gray-800">Connection History (Last 20 Events)</h4>
                <div className="space-y-2">
                  {connectionHistory.length > 0 ? (
                    connectionHistory
                      .slice()
                      .reverse()
                      .map((event, idx) => (
                        <div
                          key={idx}
                          className="bg-white rounded-lg p-3 border flex items-center gap-3"
                        >
                          {event.event === 'CONNECTED' ? (
                            <CheckCircle className="text-green-500" size={20} />
                          ) : (
                            <XCircle className="text-red-500" size={20} />
                          )}
                          <div className="flex-1">
                            <div
                              className={`font-semibold ${event.event === 'CONNECTED' ? 'text-green-600' : 'text-red-600'}`}
                            >
                              {event.event}
                            </div>
                            <div className="text-xs text-gray-500">
                              {new Date(event.timestamp).toLocaleString()}
                            </div>
                          </div>
                        </div>
                      ))
                  ) : (
                    <div className="text-center py-8 text-gray-400">
                      <AlertCircle size={48} className="mx-auto mb-2 opacity-50" />
                      <p>No connection events yet</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default WebSocketDebugger;
