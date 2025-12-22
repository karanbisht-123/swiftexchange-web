import React from 'react';

interface Column<T> {
  key: string;
  header: string;
  align?: 'left' | 'center' | 'right';
  render: (item: T) => React.ReactNode;
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

  return (
    <table className="w-full text-sm">
      <thead className="sticky top-0 bg-secondary border-b border-gray-700 z-10">
        <tr className="text-gray-400 text-xs">
          {columns.map(col => (
            <th
              key={col.key}
              className={`px-4 py-3 font-normal ${
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
      <tbody>
        {data.map(item => (
          <tr
            key={getRowKey(item)}
            className="border-b border-[#2a2a2a] hover:bg-[#1a1a1a] transition-colors"
          >
            {columns.map(col => (
              <td
                key={col.key}
                className={`px-4 py-3 ${
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
  );
}
