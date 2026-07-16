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
  type?: string;
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({ status, type }) => {
  const getStatusColor = () => {
    if (status === 'FILLED') return 'bg-green-500';
    if (['OPEN', 'PARTIALLY_FILLED'].includes(status)) return 'bg-green-500'; // matching dYdX open order color
    if (status === 'CANCELED' || status === 'BEST_EFFORT_CANCELED' || status === 'REJECTED')
      return 'bg-gray-500';
    return 'bg-yellow-500';
  };

  const displayStatus = type
    ? type.charAt(0).toUpperCase() + type.slice(1).toLowerCase()
    : status === 'BEST_EFFORT_CANCELED'
      ? 'Canceled'
      : status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();

  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-1.5 h-1.5 rounded-full ${getStatusColor()}`} />
      <span className="text-gray-300 text-xs">{displayStatus}</span>
    </div>
  );
};
