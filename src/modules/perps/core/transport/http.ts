import { ParsingError, RateLimitError, TransportError } from '../errors';

export interface HttpTransportOptions {
  baseUrl: string;
  timeoutMs?: number;
  maxRetries?: number;
}

export class HttpTransport {
  protected readonly baseUrl: string;
  protected readonly timeoutMs: number;
  protected readonly maxRetries: number;

  constructor(options: HttpTransportOptions) {
    this.baseUrl = options.baseUrl;
    this.timeoutMs = options.timeoutMs || 10000;
    this.maxRetries = options.maxRetries || 3;
  }

  public async get<T>(endpoint: string, headers?: Record<string, string>): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    });
  }

  public async post<T>(
    endpoint: string,
    body: unknown,
    headers?: Record<string, string>
  ): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(body),
    });
  }

  private async request<T>(endpoint: string, options: RequestInit, retries = 0): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 429) {
          throw new RateLimitError(`Rate limit exceeded for ${url}`);
        }

        const errorText = await response.text();
        throw new TransportError(`HTTP Error ${response.status}: ${errorText}`, response.status);
      }

      const text = await response.text();
      try {
        // Handle empty responses
        if (!text) return {} as T;
        return JSON.parse(text) as T;
      } catch {
        throw new ParsingError('Failed to parse JSON response', text);
      }
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof RateLimitError || error instanceof ParsingError) {
        throw error;
      }

      if (retries < this.maxRetries) {
        const delay = Math.pow(2, retries) * 500;
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.request<T>(endpoint, options, retries + 1);
      }

      if (error instanceof Error && error.name === 'AbortError') {
        throw new TransportError(`Request timeout after ${this.timeoutMs}ms for ${url}`);
      }

      if (error instanceof Error) {
        throw new TransportError(`Request failed: ${error.message}`);
      }

      throw new TransportError('An unknown transport error occurred');
    }
  }
}
