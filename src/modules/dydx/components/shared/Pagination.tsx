import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import React from 'react';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  loading?: boolean;
  totalItems?: number;
  itemsPerPage?: number;
  hasMore?: boolean;
}

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  onPageChange,
  loading = false,
  totalItems,
  itemsPerPage = 50,
  hasMore = false,
}) => {
  // Don't show pagination if only one page and no more data
  if (totalPages <= 1 && !hasMore) return null;

  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisible = 7;

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      if (currentPage <= 3) {
        for (let i = 1; i <= 5; i++) {
          pages.push(i);
        }
        pages.push('...');
        pages.push(totalPages);
      } else if (currentPage >= totalPages - 2) {
        pages.push(1);
        pages.push('...');
        for (let i = totalPages - 4; i <= totalPages; i++) {
          pages.push(i);
        }
      } else {
        pages.push(1);
        pages.push('...');
        for (let i = currentPage - 1; i <= currentPage + 1; i++) {
          pages.push(i);
        }
        pages.push('...');
        pages.push(totalPages);
      }
    }

    return pages;
  };

  const handlePrevious = () => {
    if (currentPage > 1 && !loading) {
      onPageChange(currentPage - 1);
    }
  };

  const handleNext = () => {
    if ((currentPage < totalPages || hasMore) && !loading) {
      onPageChange(currentPage + 1);
    }
  };

  const handlePageClick = (page: number | string) => {
    if (typeof page === 'number' && page !== currentPage && !loading) {
      onPageChange(page);
    }
  };

  // Calculate display range
  const startItem = totalItems ? (currentPage - 1) * itemsPerPage + 1 : 0;
  const endItem = totalItems ? Math.min(currentPage * itemsPerPage, totalItems) : 0;

  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3 border-t border-[#2a2a2a] bg-secondary">
      {/* Items info */}
      <div className="flex items-center gap-2 min-w-[140px]">
        {totalItems !== undefined && (
          <span className="text-xs text-gray-500">
            {startItem}-{endItem} of {totalItems}
            {hasMore && '+'}
          </span>
        )}
        {loading && (
          <Loader2 className="w-3 h-3 text-gray-400 animate-spin" />
        )}
      </div>

      {/* Page navigation */}
      <div className="flex items-center gap-2">
        {/* Previous Button */}
        <button
          onClick={handlePrevious}
          disabled={currentPage === 1 || loading}
          className="p-1.5 rounded hover:bg-[#2a2a2a] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          aria-label="Previous page"
        >
          <ChevronLeft className="w-4 h-4 text-gray-400" />
        </button>

        {/* Page Numbers */}
        <div className="flex items-center gap-1">
          {getPageNumbers().map((page, index) => {
            if (page === '...') {
              return (
                <span key={`ellipsis-${index}`} className="px-2 py-0.5 text-gray-500 text-xs">
                  ...
                </span>
              );
            }

            const isActive = page === currentPage;

            return (
              <button
                key={page}
                onClick={() => handlePageClick(page)}
                disabled={loading}
                className={`min-w-[28px] px-2 py-1 rounded text-xs font-medium transition-colors ${isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-400 hover:bg-[#2a2a2a] hover:text-white'
                  } ${loading ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                {page}
              </button>
            );
          })}
        </div>

        {/* Next Button */}
        <button
          onClick={handleNext}
          disabled={(currentPage === totalPages && !hasMore) || loading}
          className="p-1.5 rounded hover:bg-[#2a2a2a] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          aria-label="Next page"
        >
          <ChevronRight className="w-4 h-4 text-gray-400" />
        </button>
      </div>

      {/* Page info */}
      <div className="min-w-[100px] text-right">
        <span className="text-xs text-gray-500">
          Page {currentPage} of {totalPages}
          {hasMore && '+'}
        </span>
      </div>
    </div>
  );
};
