import { useState, useCallback } from 'react';
import type { Signer } from 'ethers';
import {
  getAccountInfo,
  getBalance,
  getPositionRisk,
  changeLeverage,
  changeMarginType,
  changePositionMargin,
  getLeverageBracket,
  getIncomeHistory,
  getUserTrades,
} from '../api/account';
import type {
  AsterAccountInfo,
  AsterBalance,
  AsterPositionRisk,
  MarginType,
  GetIncomeHistoryParams,
  IncomeRecord,
  SymbolLeverageBracket,
  AsterUserTrade,
} from '../types/account';

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

function initState<T>(): AsyncState<T> {
  return { data: null, loading: false, error: null };
}

function useAsync<T>(): [AsyncState<T>, (p: Promise<T>) => Promise<T | undefined>] {
  const [state, setState] = useState<AsyncState<T>>(initState());
  const run = useCallback(async (p: Promise<T>) => {
    setState({ data: null, loading: true, error: null });
    try {
      const data = await p;
      setState({ data, loading: false, error: null });
      return data;
    } catch (e) {
      setState({ data: null, loading: false, error: e instanceof Error ? e : new Error(String(e)) });
    }
  }, []);
  return [state, run];
}


export function useAccount(signer: Signer | null, userAddr: string | null) {
  const [accountState, runAccount] = useAsync<AsterAccountInfo>();
  const [balancesState, runBalances] = useAsync<AsterBalance[]>();
  const [positionsState, runPositions] = useAsync<AsterPositionRisk[]>();
  const [incomeState, runIncome] = useAsync<IncomeRecord[]>();
  const [tradesState, runTrades] = useAsync<AsterUserTrade[]>();
  const [bracketsState, runBrackets] = useAsync<SymbolLeverageBracket[]>();

  const fetchAccountInfo = useCallback(() => {
    if (!signer || !userAddr) return;
    return runAccount(getAccountInfo(signer, userAddr));
  }, [signer, userAddr, runAccount]);

  const fetchBalance = useCallback(() => {
    if (!signer || !userAddr) return;
    return runBalances(getBalance(signer, userAddr));
  }, [signer, userAddr, runBalances]);

  const fetchPositionRisk = useCallback((symbol?: string) => {
    if (!signer || !userAddr) return;
    return runPositions(getPositionRisk(signer, userAddr, symbol));
  }, [signer, userAddr, runPositions]);

  const setLeverage = useCallback((symbol: string, leverage: number) => {
    if (!signer || !userAddr) return;
    return changeLeverage(signer, userAddr, symbol, leverage);
  }, [signer, userAddr]);

  const setMarginType = useCallback((symbol: string, marginType: MarginType) => {
    if (!signer || !userAddr) return;
    return changeMarginType(signer, userAddr, symbol, marginType);
  }, [signer, userAddr]);

  const setPositionMargin = useCallback((symbol: string, amount: string, type: 1 | 2) => {
    if (!signer || !userAddr) return;
    return changePositionMargin(signer, userAddr, symbol, amount, type);
  }, [signer, userAddr]);

  const fetchLeverageBrackets = useCallback((symbol?: string) => {
    if (!signer || !userAddr) return;
    return runBrackets(getLeverageBracket(signer, userAddr, symbol));
  }, [signer, userAddr, runBrackets]);

  const fetchIncomeHistory = useCallback((params?: GetIncomeHistoryParams) => {
    if (!signer || !userAddr) return;
    return runIncome(getIncomeHistory(signer, userAddr, params));
  }, [signer, userAddr, runIncome]);

  const fetchUserTrades = useCallback((symbol: string, opts?: Parameters<typeof getUserTrades>[3]) => {
    if (!signer || !userAddr) return;
    return runTrades(getUserTrades(signer, userAddr, symbol, opts));
  }, [signer, userAddr, runTrades]);

  return {
    fetchAccountInfo,
    fetchBalance,
    fetchPositionRisk,
    setLeverage,
    setMarginType,
    setPositionMargin,
    fetchLeverageBrackets,
    fetchIncomeHistory,
    fetchUserTrades,
    accountState,
    balancesState,
    positionsState,
    incomeState,
    tradesState,
    bracketsState,
  };
}
