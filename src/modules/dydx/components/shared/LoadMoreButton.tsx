import { Loader2 } from 'lucide-react';

interface LoadMoreButtonProps {
  onLoadMore: () => void;
  loading: boolean;
  hasMore: boolean;
}

export const LoadMoreButton: React.FC<LoadMoreButtonProps> = ({ onLoadMore, loading, hasMore }) => {
  if (!hasMore) return null;

  return (
    <div className="flex justify-center py-4 border-t border-[#2a2a2a]">
      <button
        onClick={onLoadMore}
        disabled={loading}
        className="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white rounded transition-colors flex items-center gap-2"
      >
        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
        {loading ? 'Loading...' : 'Load More'}
      </button>
    </div>
  );
};
