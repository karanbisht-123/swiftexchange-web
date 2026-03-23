import React from 'react';

interface Column<T> {
  key: string;
  header: string;
  align?: 'left' | 'center' | 'right';
  render: (item: T) => React.ReactNode;
  mobileLabel?: string;
  hideOnMobile?: boolean;
  mobileStyle?: 'compact' | 'labeled';
  mobilePriority?: number;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  getRowKey: (item: T) => string;
  emptyState?: React.ReactNode;
}

export function DataTable<T>({ data, columns, getRowKey, emptyState }: DataTableProps<T>) {
  if (data.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  const visibleColumns = columns.filter(col => !col.hideOnMobile);

  const compactColumns = visibleColumns
    .filter(col => col.mobileStyle === 'compact')
    .sort((a, b) => (a.mobilePriority || 0) - (b.mobilePriority || 0));

  const labeledColumns = visibleColumns
    .filter(col => col.mobileStyle === 'labeled')
    .sort((a, b) => (a.mobilePriority || 0) - (b.mobilePriority || 0));

  const fallbackColumns = visibleColumns.filter(col => !col.mobileStyle);

  return (
    <>
      {/* Desktop Table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-secondary border-b border-color z-10">
            <tr className="text-muted text-xs">
              {columns.map(col => (
                <th
                  key={col.key}
                  className={`px-4 py-3 font-medium ${
                    col.align === 'left'
                      ? 'text-left'
                      : col.align === 'right'
                        ? 'text-right'
                        : 'text-center'
                  }`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-secondary">
            {data.map(item => (
              <tr
                key={getRowKey(item)}
                className="border-b border-color hover:bg-hover transition-colors"
              >
                {columns.map(col => (
                  <td
                    key={col.key}
                    className={`px-4 py-3 text-primary ${
                      col.align === 'left'
                        ? 'text-left'
                        : col.align === 'right'
                          ? 'text-right'
                          : 'text-center'
                    }`}
                  >
                    {col.render(item)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="md:hidden space-y-2 p-2">
        {data.map(item => (
          <div
            key={getRowKey(item)}
            className="bg-secondary border border-color rounded-lg p-2.5 overflow-x-auto"
          >
            <div className="flex items-center gap-3 min-w-max">
              {compactColumns.length > 0 &&
                compactColumns.map(col => (
                  <div key={col.key} className="text-primary font-medium text-xs">
                    {col.render(item)}
                  </div>
                ))}

              {compactColumns.length > 0 && labeledColumns.length > 0 && (
                <div className="h-4 w-px bg-color" />
              )}

              {/* Labeled items */}
              {labeledColumns.length > 0 &&
                labeledColumns.map(col => (
                  <div key={col.key} className="flex items-center gap-1.5">
                    <span className="text-muted text-[10px] uppercase tracking-wide">
                      {col.mobileLabel || col.header}:
                    </span>
                    <span className="text-primary font-medium text-xs">{col.render(item)}</span>
                  </div>
                ))}

              {compactColumns.length === 0 &&
                labeledColumns.length === 0 &&
                fallbackColumns.map(col => (
                  <div key={col.key} className="flex items-center gap-1.5">
                    <span className="text-muted text-[10px] uppercase tracking-wide">
                      {col.mobileLabel || col.header}:
                    </span>
                    <span className="text-primary font-medium text-xs">{col.render(item)}</span>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
