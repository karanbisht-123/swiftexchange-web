import { ASTER_ENDPOINTS, ASTER_REST_URL } from '../constants';

export interface AggTradeData {
  a: number; // Aggregate tradeId
  p: string; // Price
  q: string; // Quantity
  f: number; // First tradeId
  l: number; // Last tradeId
  T: number; // Timestamp
  m: boolean; // Was the buyer the maker?
}

export async function getAggTrades(symbol: string, limit: number = 80): Promise<AggTradeData[]> {
  const url = `${ASTER_REST_URL}${ASTER_ENDPOINTS.AGG_TRADES}?symbol=${symbol}&limit=${limit}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch agg trades: ${response.statusText}`);
  }
  return response.json();
}
