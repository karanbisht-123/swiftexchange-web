interface MarketBadgeProps {
  market: string;
  gradientFrom?: string;
  gradientTo?: string;
}

export const MarketBadge: React.FC<MarketBadgeProps> = ({
  market,
  gradientFrom = 'orange-500',
  gradientTo = 'red-500',
}) => {
  const marketName = market?.split('-')[0] || 'N/A';
  const initial = marketName?.charAt(0) || 'C';

  return (
    <div className="flex items-center gap-2">
      <div
        className={`w-6 h-6 rounded-full bg-gradient-to-br from-${gradientFrom} to-${gradientTo} flex items-center justify-center text-white text-xs font-bold`}
      >
        {initial}
      </div>
      <span className="text-white font-medium">{marketName}</span>
    </div>
  );
};
