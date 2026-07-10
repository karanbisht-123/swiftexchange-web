import { describe, expect, it } from 'vitest';

import { classifyBridgeError } from '../bridgeErrorUtils';

describe('classifyBridgeError', () => {
  it('should classify user rejection errors', () => {
    const error1 = { message: 'User rejected the transaction' };
    const res1 = classifyBridgeError(error1);
    expect(res1.type).toBe('user_rejected');
    expect(res1.retryable).toBe(true);

    const error2 = new Error('action_rejected');
    const res2 = classifyBridgeError(error2);
    expect(res2.type).toBe('user_rejected');
  });

  it('should classify insufficient gas errors from viem/ethers', () => {
    const error = { message: 'insufficient funds for gas * price + value' };
    const res = classifyBridgeError(error);
    expect(res.type).toBe('insufficient_gas');
    expect(res.retryable).toBe(true);
  });

  it('should classify cosmos bank/gas fee errors', () => {
    const error = {
      message:
        'broadcasterror: broadcasting transaction failed: spendable balance 10000000 is smaller than 12000000: insufficient funds',
    };
    const res = classifyBridgeError(error);
    expect(res.type).toBe('insufficient_gas');
    expect(res.message).toContain('wallet has $10.0000 USDC, fee requires $12.0000 USDC');
    expect(res.retryable).toBe(true);
  });

  it('should classify token balance insufficient errors', () => {
    const error = new Error('insufficient funds for transfer');
    const res = classifyBridgeError(error);
    expect(res.type).toBe('insufficient_balance');
    expect(res.retryable).toBe(true);
  });

  it('should classify RPC network failure errors', () => {
    const error = { message: 'failed to fetch from rpc' };
    const res = classifyBridgeError(error);
    expect(res.type).toBe('rpc_failure');
    expect(res.retryable).toBe(true);
  });

  it('should classify bridge API errors', () => {
    const error1 = new Error('no route found for token');
    const res1 = classifyBridgeError(error1);
    expect(res1.type).toBe('bridge_api_failure');
    expect(res1.message).toContain('No bridge route found');

    const error2 = new Error('invalid user addresses in route');
    const res2 = classifyBridgeError(error2);
    expect(res2.type).toBe('bridge_api_failure');
    expect(res2.message).toContain('wallet address mismatch');
  });

  it('should classify reverted transaction errors', () => {
    const error = new Error('execution reverted: slippage exceeded');
    const res = classifyBridgeError(error);
    expect(res.type).toBe('tx_reverted');
    expect(res.retryable).toBe(true);
  });

  it('should classify timeout errors', () => {
    const error = new Error('operation timed out');
    const res = classifyBridgeError(error);
    expect(res.type).toBe('timeout');
    expect(res.retryable).toBe(false);
  });

  it('should classify unknown errors', () => {
    const error = 'Some weird error format';
    const res = classifyBridgeError(error);
    expect(res.type).toBe('unknown');
    expect(res.message).toBe('Some weird error format');
    expect(res.retryable).toBe(true);
  });
});
