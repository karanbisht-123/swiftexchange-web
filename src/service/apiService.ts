import type { ApiResponse } from '../types/evm/apiResponse.type';

const BASE_URL = import.meta.env.VITE_BASE_URL as string;
const USER_API_TOKEN = import.meta.env.VITE_API_USER_AUTH as string;
const DEVICE_API_TOKEN = import.meta.env.VITE_API_DEVICE_AUTH as string;
const SERVER_BASE_URL = import.meta.env.VITE_BASE_SERVER_URL as string;

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries: number = 3,
  delay: number = 1000
): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      if (response.ok) return response;
      if (i === retries - 1) return response;
    } catch (error) {
      if (i === retries - 1) throw error;
    }
    await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
  }
  throw new Error('Max retries reached');
}

export async function fetchApiResponseFromProxy<T>(
  endpoint: string,
  method: 'GET' | 'POST' = 'POST',
  body?: unknown,
  retries?: number
): Promise<ApiResponse<T>> {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'x-auth-device-token': DEVICE_API_TOKEN,
    Authorization: `Bearer ${USER_API_TOKEN}`,
  };

  const response = await fetchWithRetry(
    `${BASE_URL}${endpoint}`,
    {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    },
    retries
  );

  if (!response.ok) {
    try {
      const errorData = await response.json();
      const errorMessage = errorData.message || errorData.error || response.statusText;
      throw new Error(errorMessage);
    } catch (parseError) {
      throw new Error(`API error: ${response.statusText} - ${(parseError as Error).message}`);
    }
  }

  const data = await response.json();
  return { data };
}

export async function fetchApiResponseFromServer<T>(
  endpoint: string,
  method: 'GET' | 'POST' | 'PATCH' = 'POST',
  body?: unknown,
  retries?: number
): Promise<ApiResponse<T>> {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'x-auth-device-token': DEVICE_API_TOKEN,
    Authorization: `Bearer ${USER_API_TOKEN}`,
  };

  const response = await fetchWithRetry(
    `${SERVER_BASE_URL}${endpoint}`,
    {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    },
    retries
  );

  if (!response.ok) {
    try {
      const errorData = await response.json();
      const errorMessage = errorData.message || errorData.error || response.statusText;
      throw new Error(errorMessage);
    } catch (parseError) {
      throw new Error(`API error: ${response.statusText} - ${(parseError as Error).message}`);
    }
  }

  const data = await response.json();
  return { data };
}
