interface SideBadgeProps {
  side: 'BUY' | 'SELL';
}

export const SideBadge: React.FC<SideBadgeProps> = ({ side }) => (
  <span className={`font-medium ${side === 'BUY' ? 'text-green-400' : 'text-red-400'}`}>
    {side === 'BUY' ? 'Buy' : 'Sell'}
  </span>
);

interface StatusIndicatorProps {
  status: string;
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({ status }) => {
  const getStatusColor = () => {
    if (status === 'FILLED') return 'bg-green-500';
    if (['OPEN', 'PARTIALLY_FILLED'].includes(status)) return 'bg-blue-500';
    if (status === 'CANCELED' || status === 'BEST_EFFORT_CANCELED') return 'bg-gray-500';
    return 'bg-yellow-500';
  };

  const displayStatus = status === 'BEST_EFFORT_CANCELED' ? 'Canceled' : status;

  return (
    <div className="flex items-center justify-center gap-1.5">
      <div className={`w-1.5 h-1.5 rounded-full ${getStatusColor()}`} />
      <span className="text-gray-300 text-xs">{displayStatus}</span>
    </div>
  );
};
