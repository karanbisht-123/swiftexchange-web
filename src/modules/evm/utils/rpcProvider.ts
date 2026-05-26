import { ethers } from 'ethers';

const PERMANENT_ERROR_PATTERNS = [
  'cors',
  'cross-origin',
  'access-control',
  'failed to fetch',
  'load failed',
  'network request failed',
  'networkerror',
  'net::err',
  'could not detect network',
  'network_error',
  'err_cert',
  'ssl',
  'certificate',
  'invalid_cert',
  'err_cert_common_name_invalid',
  'err_cert_authority_invalid',
  'unauthorized',
  'forbidden',
  '401',
  '402',
  '403',
  'payment required',
  'invalid api key',
  'authentication',
  'access denied',
  'not allowed',
];

const RATE_LIMIT_PATTERNS = ['429', 'too many requests', 'rate limit', 'rate_limit', 'throttle'];

const TRANSIENT_PATTERNS = ['timeout', 'etimedout', 'econnreset', 'econnrefused', 'socket', 'hang up', 'enotfound'];

const CircuitState = {
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN',
} as const;

type CircuitState = (typeof CircuitState)[keyof typeof CircuitState];

interface CircuitBreaker {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureTime: number;
  openedAt: number;
  consecutiveSuccessesNeeded: number;
  backoffMs: number;
}

interface UrlStats {
  circuit: CircuitBreaker;
  totalRequests: number;
  totalFailures: number;
  lastUsed: number;
  avgLatencyMs: number;
  latencySamples: number[];
}

function classifyError(error: any): 'permanent' | 'rate_limit' | 'transient' | 'revert' {
  const msg = (error?.message || String(error)).toLowerCase();
  const code = (error?.code || '').toUpperCase();
  const status =
    error?.status ??
    error?.info?.status ??
    error?.response?.status ??
    error?.statusCode;

  // Detect deterministic EVM execution reverts or insufficient funds
  if (code === 'CALL_EXCEPTION' || code === 'INSUFFICIENT_FUNDS') {
    return 'revert';
  }
  if (
    msg.includes('execution reverted') ||
    msg.includes('insufficient funds') ||
    msg.includes('gas required exceeds allowance')
  ) {
    return 'revert';
  }

  if (error?.info?.permanent === true) return 'permanent';

  if (code === 'TIMEOUT' || code === 'CANCELLED') return 'transient';

  if (code === 'NETWORK_ERROR') {
    const inner = (error?.info?.message || msg).toLowerCase();
    if (PERMANENT_ERROR_PATTERNS.some(p => inner.includes(p))) return 'permanent';
    return 'transient';
  }

  if (code === 'SERVER_ERROR') {
    if (status === 401 || status === 403 || status === 402) return 'permanent';
    if (status === 429) return 'rate_limit';
    return 'transient';
  }

  if (code === 'UNSUPPORTED_OPERATION' || code === 'INVALID_ARGUMENT') return 'permanent';

  if (status === 401 || status === 403 || status === 402) return 'permanent';
  if (status === 429) return 'rate_limit';

  if (PERMANENT_ERROR_PATTERNS.some(p => msg.includes(p))) return 'permanent';
  if (RATE_LIMIT_PATTERNS.some(p => msg.includes(p))) return 'rate_limit';
  if (TRANSIENT_PATTERNS.some(p => msg.includes(p))) return 'transient';

  return 'transient';
}

function jitter(base: number, factor = 0.3): number {
  return base + base * factor * (Math.random() - 0.5) * 2;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

const CIRCUIT_CONFIG = {
  failureThreshold: 3,
  halfOpenProbeInterval: 15_000,
  halfOpenSuccessThreshold: 2,
  initialBackoffMs: 5_000,
  maxBackoffMs: 120_000,
  backoffMultiplier: 2,
  successResetCount: 5,
};

class RPCManager {
  private providerCache: Map<string, ethers.JsonRpcProvider> = new Map();
  private urlStats: Map<string, UrlStats> = new Map();
  private roundRobinIndex: Map<number | string, number> = new Map();
  private chainDeadUntil: Map<number | string, number> = new Map();
  private probeInFlight: Set<string> = new Set();
  private activeUrl: Map<number | string, string> = new Map();

  private readonly REQUEST_TIMEOUT_MS = 8_000;
  private readonly CHAIN_DEAD_BACKOFF_MS = 30_000;

  private getStats(url: string): UrlStats {
    if (!this.urlStats.has(url)) {
      this.urlStats.set(url, {
        circuit: {
          state: CircuitState.CLOSED,
          failureCount: 0,
          successCount: 0,
          lastFailureTime: 0,
          openedAt: 0,
          consecutiveSuccessesNeeded: CIRCUIT_CONFIG.halfOpenSuccessThreshold,
          backoffMs: CIRCUIT_CONFIG.initialBackoffMs,
        },
        totalRequests: 0,
        totalFailures: 0,
        lastUsed: 0,
        avgLatencyMs: 0,
        latencySamples: [],
      });
    }
    return this.urlStats.get(url)!;
  }

  private getProvider(url: string): ethers.JsonRpcProvider {
    if (!this.providerCache.has(url)) {
      const req = new ethers.FetchRequest(url);
      req.retryFunc = async () => false;
      req.timeout = this.REQUEST_TIMEOUT_MS;
      const provider = new ethers.JsonRpcProvider(req, undefined, { staticNetwork: true });
      provider.pollingInterval = 99_999_999;
      this.providerCache.set(url, provider);
    }
    return this.providerCache.get(url)!;
  }

  private evict(url: string): void {
    const p = this.providerCache.get(url);
    if (p) {
      try { p.destroy(); } catch { }
      this.providerCache.delete(url);
    }
  }

  private recordLatency(stats: UrlStats, ms: number): void {
    stats.latencySamples.push(ms);
    if (stats.latencySamples.length > 20) stats.latencySamples.shift();
    stats.avgLatencyMs =
      stats.latencySamples.reduce((a, b) => a + b, 0) / stats.latencySamples.length;
  }

  private onSuccess(url: string, latencyMs: number): void {
    const stats = this.getStats(url);
    const cb = stats.circuit;

    stats.totalRequests++;
    stats.lastUsed = Date.now();
    this.recordLatency(stats, latencyMs);

    if (cb.state === CircuitState.HALF_OPEN) {
      cb.successCount++;
      if (cb.successCount >= cb.consecutiveSuccessesNeeded) {
        cb.state = CircuitState.CLOSED;
        cb.failureCount = 0;
        cb.successCount = 0;
        cb.backoffMs = CIRCUIT_CONFIG.initialBackoffMs;
        this.probeInFlight.delete(url);
      }
      return;
    }

    if (cb.state === CircuitState.CLOSED) {
      cb.successCount++;
      if (cb.successCount >= CIRCUIT_CONFIG.successResetCount) {
        cb.failureCount = 0;
        cb.successCount = 0;
      }
    }
  }

  private onFailure(url: string, errorType: 'permanent' | 'rate_limit' | 'transient'): void {
    const stats = this.getStats(url);
    const cb = stats.circuit;

    stats.totalRequests++;
    stats.totalFailures++;
    stats.lastUsed = Date.now();
    cb.lastFailureTime = Date.now();
    cb.successCount = 0;

    if (errorType === 'permanent') {
      cb.state = CircuitState.OPEN;
      cb.openedAt = Date.now();
      cb.backoffMs = CIRCUIT_CONFIG.maxBackoffMs;
      this.evict(url);
      this.probeInFlight.delete(url);
      return;
    }

    if (errorType === 'rate_limit') {
      cb.state = CircuitState.OPEN;
      cb.openedAt = Date.now();
      cb.backoffMs = clamp(
        jitter(cb.backoffMs * CIRCUIT_CONFIG.backoffMultiplier),
        CIRCUIT_CONFIG.initialBackoffMs,
        CIRCUIT_CONFIG.maxBackoffMs
      );
      this.evict(url);
      this.probeInFlight.delete(url);
      return;
    }

    cb.failureCount++;

    if (cb.state === CircuitState.HALF_OPEN || cb.failureCount >= CIRCUIT_CONFIG.failureThreshold) {
      cb.state = CircuitState.OPEN;
      cb.openedAt = Date.now();
      cb.backoffMs = clamp(
        jitter(cb.backoffMs * CIRCUIT_CONFIG.backoffMultiplier),
        CIRCUIT_CONFIG.initialBackoffMs,
        CIRCUIT_CONFIG.maxBackoffMs
      );
      this.evict(url);
      this.probeInFlight.delete(url);
    }
  }

  private isUrlAvailable(url: string): boolean {
    const stats = this.getStats(url);
    const cb = stats.circuit;

    if (cb.state === CircuitState.CLOSED) return true;

    if (cb.state === CircuitState.OPEN) {
      const elapsed = Date.now() - cb.openedAt;
      if (elapsed >= cb.backoffMs) {
        cb.state = CircuitState.HALF_OPEN;
        cb.successCount = 0;
        return !this.probeInFlight.has(url);
      }
      return false;
    }

    if (cb.state === CircuitState.HALF_OPEN) {
      return !this.probeInFlight.has(url);
    }

    return false;
  }

  isChainDead(chainId: number | string, urls: string[]): boolean {
    const deadUntil = this.chainDeadUntil.get(chainId);
    if (deadUntil && Date.now() < deadUntil) return true;

    const unique = Array.from(new Set(urls.filter(Boolean)));
    return unique.length > 0 && unique.every(u => !this.isUrlAvailable(u));
  }

  private pickUrls(chainId: number | string, urls: string[]): string[] {
    const unique = Array.from(new Set(urls.filter(Boolean)));
    const available = unique.filter(u => this.isUrlAvailable(u));

    if (available.length === 0) return [];

    available.sort((a, b) => {
      const sa = this.getStats(a);
      const sb = this.getStats(b);
      const scoreA = sa.avgLatencyMs + (sa.totalFailures / Math.max(sa.totalRequests, 1)) * 1000;
      const scoreB = sb.avgLatencyMs + (sb.totalFailures / Math.max(sb.totalRequests, 1)) * 1000;
      return scoreA - scoreB;
    });

    const start = this.roundRobinIndex.get(chainId) ?? 0;
    const rotated = [
      ...available.slice(start % available.length),
      ...available.slice(0, start % available.length),
    ];
    this.roundRobinIndex.set(chainId, (start + 1) % available.length);

    return rotated;
  }

  async fetchWithFallback<T>(
    chainId: number | string,
    urls: string[],
    action: (provider: ethers.JsonRpcProvider) => Promise<T>
  ): Promise<T> {
    if (!urls?.length) throw new Error(`No RPC URLs configured for chain ${chainId}`);

    if (this.isChainDead(chainId, urls)) {
      const unique = Array.from(new Set(urls.filter(Boolean)));
      const statuses = unique.map(u => {
        const cb = this.getStats(u).circuit;
        const retryIn = cb.state === CircuitState.OPEN
          ? Math.max(0, Math.round((cb.backoffMs - (Date.now() - cb.openedAt)) / 1000))
          : 0;
        return `${u} [${cb.state}${retryIn > 0 ? ` retry in ${retryIn}s` : ''}]`;
      });
      throw new Error(
        `Chain ${chainId} — all RPCs unavailable.\n${statuses.join('\n')}`
      );
    }

    let ordered = this.pickUrls(chainId, urls);
    const active = this.activeUrl.get(chainId);
    if (active && ordered.includes(active) && this.isUrlAvailable(active)) {
      ordered = [active, ...ordered.filter(u => u !== active)];
    }

    if (ordered.length === 0) {
      throw new Error(`Chain ${chainId} — no available RPCs after filtering`);
    }

    let lastError: any;

    for (const url of ordered) {
      const stats = this.getStats(url);
      const isHalfOpen = stats.circuit.state === CircuitState.HALF_OPEN;

      if (isHalfOpen) this.probeInFlight.add(url);

      const start = Date.now();

      try {
        const provider = this.getProvider(url);

        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(Object.assign(new Error(`RPC timeout after ${this.REQUEST_TIMEOUT_MS}ms`), { code: 'timeout' })),
            this.REQUEST_TIMEOUT_MS + 500
          )
        );

        const result = await Promise.race([action(provider), timeoutPromise]);

        this.onSuccess(url, Date.now() - start);
        this.activeUrl.set(chainId, url);

        if (this.chainDeadUntil.has(chainId)) {
          this.chainDeadUntil.delete(chainId);
        }

        return result;
      } catch (error: any) {
        lastError = error;
        const errorType = classifyError(error);

        if (errorType === 'revert') {
          throw error;
        }

        this.onFailure(url, errorType);

        if (isHalfOpen) this.probeInFlight.delete(url);

        if (this.activeUrl.get(chainId) === url) {
          this.activeUrl.delete(chainId);
        }

        if (errorType === 'permanent') continue;
        if (errorType === 'rate_limit') continue;
      }
    }

    const allUrls = Array.from(new Set(urls.filter(Boolean)));
    const allDead = allUrls.every(u => !this.isUrlAvailable(u));
    if (allDead) {
      this.chainDeadUntil.set(chainId, Date.now() + jitter(this.CHAIN_DEAD_BACKOFF_MS, 0.5));
    }

    throw new Error(
      `All ${ordered.length} RPCs failed for chain ${chainId}. Last: ${lastError?.message ?? 'unknown'}`
    );
  }

  getUrlStatus(url: string): { state: CircuitState; backoffMs: number; failureCount: number; avgLatencyMs: number } {
    const stats = this.getStats(url);
    return {
      state: stats.circuit.state,
      backoffMs: stats.circuit.backoffMs,
      failureCount: stats.circuit.failureCount,
      avgLatencyMs: Math.round(stats.avgLatencyMs),
    };
  }

  getChainStatus(_chainId: number | string, urls: string[]): Record<string, ReturnType<typeof this.getUrlStatus>> {
    const result: Record<string, ReturnType<typeof this.getUrlStatus>> = {};
    for (const url of urls) {
      result[url] = this.getUrlStatus(url);
    }
    return result;
  }

  resetUrl(url: string): void {
    const stats = this.getStats(url);
    stats.circuit.state = CircuitState.CLOSED;
    stats.circuit.failureCount = 0;
    stats.circuit.successCount = 0;
    stats.circuit.backoffMs = CIRCUIT_CONFIG.initialBackoffMs;
    this.probeInFlight.delete(url);
    this.evict(url);
  }

  resetChain(chainId: number | string, urls: string[]): void {
    this.chainDeadUntil.delete(chainId);
    for (const url of urls) this.resetUrl(url);
  }
}

export const rpcManager = new RPCManager();
export { CircuitState };
export type { UrlStats };