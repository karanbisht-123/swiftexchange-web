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
  itemsPerPage = 10,
  hasMore = false,
}) => {
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

  const getMobilePageNumbers = () => {
    const pages: (number | string)[] = [];

    if (currentPage > 1) {
      pages.push(currentPage - 1);
    }
    pages.push(currentPage);
    if (currentPage < totalPages) {
      pages.push(currentPage + 1);
    }

    return pages;
  };

  const isFirstPage = currentPage === 1;
  const isLastPage = currentPage === totalPages;

  const handlePrevious = () => {
    if (!isFirstPage && !loading) {
      onPageChange(currentPage - 1);
    }
  };

  const handleNext = () => {
    if (!isLastPage && !loading) {
      onPageChange(currentPage + 1);
    }
  };

  const handlePageClick = (page: number | string) => {
    if (typeof page === 'number' && page !== currentPage && !loading) {
      onPageChange(page);
    }
  };

  const startItem = totalItems ? (currentPage - 1) * itemsPerPage + 1 : 0;
  const endItem = totalItems ? Math.min(currentPage * itemsPerPage, totalItems) : 0;

  return (
    <div className="border-t border-color bg-secondary">
      <div className="hidden md:flex items-center justify-between gap-4 px-4 py-3">
        <div className="flex items-center gap-2 min-w-[140px]">
          {totalItems !== undefined && (
            <span className="text-xs text-muted">
              {startItem}-{endItem} of {totalItems}
              {hasMore && '+'}
            </span>
          )}
          {loading && <Loader2 className="w-3 h-3 text-muted animate-spin" />}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handlePrevious}
            disabled={isFirstPage || loading}
            className="p-1.5 rounded hover:bg-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            aria-label="Previous page"
          >
            <ChevronLeft className="w-4 h-4 text-muted" />
          </button>

          <div className="flex items-center gap-1">
            {getPageNumbers().map((page, index) => {
              if (page === '...') {
                return (
                  <span key={`ellipsis-${index}`} className="px-2 py-0.5 text-muted text-xs">
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
                  className={`min-w-[32px] px-2 py-2 rounded  text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'text-muted bg-primary hover:bg-hover hover:text-primary'
                  } ${loading ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  {page}
                </button>
              );
            })}
          </div>

          <button
            onClick={handleNext}
            disabled={isLastPage || loading}
            className="p-1.5 rounded hover:bg-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            aria-label="Next page"
          >
            <ChevronRight className="w-4 h-4 text-muted" />
          </button>
        </div>

        <div className="min-w-[100px] text-right">
          <span className="text-xs text-muted">
            Page {currentPage} of {totalPages}
            {hasMore && '+'}
          </span>
        </div>
      </div>

      <div className="md:hidden flex items-center justify-between px-3 py-2.5">
        <div>
          <button
            onClick={handlePrevious}
            disabled={isFirstPage || loading}
            className="flex items-center gap-1 px-3 py-1.5 rounded bg-primary hover:bg-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-xs font-medium text-primary"
            aria-label="Previous page"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Prev
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          {getMobilePageNumbers().map((page, index) => {
            const isActive = page === currentPage;

            return (
              <button
                key={`${page}-${index}`}
                onClick={() => handlePageClick(page)}
                disabled={loading}
                className={`min-w-[32px] px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'bg-primary text-muted hover:bg-hover hover:text-primary'
                } ${loading ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                {page}
              </button>
            );
          })}
          {loading && <Loader2 className="w-3 h-3 text-muted animate-spin ml-1" />}
        </div>

        <div>
          <button
            onClick={handleNext}
            disabled={isLastPage || loading}
            className="flex items-center gap-1 px-3 py-1.5 rounded bg-primary hover:bg-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-xs font-medium text-primary"
            aria-label="Next page"
          >
            Next
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
