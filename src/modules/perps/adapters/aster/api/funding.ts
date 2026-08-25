import { ASTER_ENDPOINTS, ASTER_REST_URL, ASTER_BAPI_URL, BAPI_ENDPOINTS } from '../constants';

export interface FundingRateData {
  symbol: string;
  fundingRate: string;
  fundingTime: number;
}

export interface FundingInfoData {
  symbol: string;
  interestRate: string;
  time: number;
  fundingIntervalHours: number;
  fundingFeeCap: number;
  fundingFeeFloor: number;
}

export async function getFundingRates(symbol: string, limit: number = 336): Promise<FundingRateData[]> {
  const url = `${ASTER_BAPI_URL}${BAPI_ENDPOINTS.FUNDING_HISTORY}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      symbol: symbol,
      page: 1,
      rows: limit,
      sourceCode: "astherus"
    })
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch funding rates: ${response.statusText}`);
  }
  const json = await response.json();
  if (json.code === '000000' && Array.isArray(json.data)) {
    return json.data.map((item: any) => ({
      symbol: item.symbol,
      fundingRate: item.lastFundingRate,
      fundingTime: item.calcTime,
    }));
  }
  return [];
}

export async function getSymbolDetail(coin: string): Promise<any> {
  const url = `${ASTER_BAPI_URL}${BAPI_ENDPOINTS.SYMBOL_DETAIL}?symbol=${coin}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch symbol detail: ${response.statusText}`);
  }
  const json = await response.json();
  if (json.code === '000000' && json.data?.detail?.info?.data) {
    const coinData = Object.values(json.data.detail.info.data)[0];
    const metrics = json.data.detail.quotes?.data;
    const finalMetrics = metrics ? Object.values(metrics)[0] : null;
    return { ...(coinData as object), metrics: finalMetrics };
  }
  return null;
}

export async function getSymbolAthl(coin: string): Promise<any> {
  const url = `${ASTER_BAPI_URL}${BAPI_ENDPOINTS.SYMBOL_ATHL}?symbol=${coin}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch symbol ATH/ATL: ${response.statusText}`);
  }
  const json = await response.json();
  if (json.code === '000000' && json.data) {
    return json.data;
  }
  return null;
}

export async function getFundingInfo(symbol?: string): Promise<FundingInfoData[]> {
  const url = symbol 
    ? `${ASTER_REST_URL}${ASTER_ENDPOINTS.FUNDING_INFO}?symbol=${symbol}`
    : `${ASTER_REST_URL}${ASTER_ENDPOINTS.FUNDING_INFO}`;
    
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch funding info: ${response.statusText}`);
  }
  return response.json();
}

export async function getBrackets(): Promise<any[]> {
  const url = `${ASTER_BAPI_URL}${BAPI_ENDPOINTS.BRACKETS}`;
  const response = await fetch(url, { 
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({})
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch brackets: ${response.statusText}`);
  }
  const json = await response.json();
  if (json.code === '000000' && json.data?.brackets) {
    return json.data.brackets;
  }
  return [];
}

export async function getRealTimeFundingRate(symbol: string): Promise<any> {
  const url = `${ASTER_BAPI_URL}${BAPI_ENDPOINTS.REAL_TIME_FUNDING_RATE}?symbol=${symbol}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch real-time funding rate: ${response.statusText}`);
  }
  const json = await response.json();
  if (json.code === '000000' && Array.isArray(json.data) && json.data.length > 0) {
    return json.data[0];
  }
  return null;
}
