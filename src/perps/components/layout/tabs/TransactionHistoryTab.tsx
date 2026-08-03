import React from 'react';
import { useTransactionHistory } from '../../../adapters/aster/hooks/useTransactionHistory';


interface Props {
  signer: any;
  userAddr: string;
}

export const TransactionHistoryTab: React.FC<Props> = ({ signer, userAddr }) => {
  
  const { income, isLoading } = useTransactionHistory(signer, userAddr);

  return (
    <div className="w-full h-full overflow-y-auto">
      <table className="w-full text-[11px] text-left whitespace-nowrap">
        <thead className="text-secondary border-b border-color sticky top-0 bg-primary z-10">
          <tr>
            <th className="px-4 py-2 font-medium">Time</th>
            <th className="px-4 py-2 font-medium">Type</th>
            <th className="px-4 py-2 font-medium">Amount</th>
            <th className="px-4 py-2 font-medium">Symbol</th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <tr><td colSpan={4} className="px-4 py-8 text-center text-muted">Loading...</td></tr>
          ) : income.length === 0 ? (
            <tr><td colSpan={4} className="px-4 py-8 text-center text-muted">No transaction history</td></tr>
          ) : (
            income.map((inc, index) => (
              <tr key={`${inc.tranId}-${index}`} className="border-b border-color hover:bg-hover">
                <td className="px-4 py-2 text-secondary">{new Date(inc.time).toLocaleString()}</td>
                <td className="px-4 py-2 text-primary">{inc.incomeType}</td>
                <td className={`px-4 py-2 ${parseFloat(inc.income) > 0 ? 'text-success' : parseFloat(inc.income) < 0 ? 'text-danger' : 'text-primary'}`}>{inc.income} {inc.asset}</td>
                <td className="px-4 py-2 text-primary">{inc.symbol}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};
