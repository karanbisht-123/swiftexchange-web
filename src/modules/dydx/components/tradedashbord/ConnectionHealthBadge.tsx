import { useWebSocketStore } from '../../store/websocketStore';

type WsState = ReturnType<typeof useWebSocketStore.getState>;

export const ConnectionHealthBadge = () => {
  const connectionStatus = useWebSocketStore((s: WsState) => s.connectionStatus);
  const isConnected = useWebSocketStore((s: WsState) => s.isConnected);

  const isDown = !isConnected || connectionStatus === 'disconnected';

  if (!isDown) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="false"
      className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
    >
      <div className="pointer-events-auto max-w-sm w-full mx-4 rounded-2xl border border-red-500/30 bg-red-950/95 backdrop-blur-md shadow-2xl p-5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex-shrink-0 w-3 h-3 rounded-full bg-red-500 animate-pulse" />
          <div className="flex-1">
            <p className="text-red-300 font-semibold text-sm">Live feed disconnected</p>
            <p className="text-red-400/70 text-xs mt-1 leading-relaxed">
              Orderbook and trade data may be stale. The connection will automatically recover —
              avoid placing orders until reconnected.
            </p>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <span className="text-red-500/50 text-xs">Reconnecting automatically…</span>
          <button
            onClick={e =>
              ((e.currentTarget.closest('[role="alertdialog"]')! as HTMLElement).style.display =
                'none')
            }
            className="text-xs text-red-400 hover:text-red-300 border border-red-500/30 hover:border-red-400/50 px-3 py-1 rounded-lg transition-colors"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};
