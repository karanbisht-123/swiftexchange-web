import { describe, expect, it } from 'vitest';

import {
  validateDepositAmount,
  validateNumberInput,
  validateWithdrawAmount,
} from '../inputValidation';

describe('validateNumberInput', () => {
  it('should remove non-numeric and non-dot characters', () => {
    expect(validateNumberInput('12a3.4b5')).toBe('123.45');
    expect(validateNumberInput('$1,000.50')).toBe('1000.50');
  });

  it('should keep only the first dot and merge/remove subsequent ones', () => {
    expect(validateNumberInput('1.2.3')).toBe('1.23');
    expect(validateNumberInput('1.2.3.4')).toBe('1.234');
  });

  it('should handle values without dots', () => {
    expect(validateNumberInput('12345')).toBe('12345');
  });
});

describe('validateDepositAmount', () => {
  it('should return invalid for NaN or non-positive values', () => {
    expect(validateDepositAmount(NaN, 100, 10)).toEqual({ valid: false, error: null });
    expect(validateDepositAmount(0, 100, 0)).toEqual({ valid: false, error: null });
    expect(validateDepositAmount(-5, 100, -5)).toEqual({ valid: false, error: null });
  });

  it('should return error if amount exceeds wallet balance', () => {
    expect(validateDepositAmount(150, 100, 150)).toEqual({
      valid: false,
      error: 'Amount exceeds wallet balance',
      errorType: 'INSUFFICIENT_BALANCE',
    });
  });

  it('should return error if usdEquivalent is below minDepositUsd', () => {
    expect(validateDepositAmount(5, 100, 0.5, 1.0)).toEqual({
      valid: false,
      error: 'Minimum deposit is $1.00',
      errorType: 'AMOUNT_TOO_LOW',
    });
  });

  it('should return valid if all checks pass', () => {
    expect(validateDepositAmount(50, 100, 50, 1.0)).toEqual({ valid: true, error: null });
    expect(validateDepositAmount(50, 100, null, 1.0)).toEqual({ valid: true, error: null });
  });
});

describe('validateWithdrawAmount', () => {
  it('should return invalid for NaN or non-positive values', () => {
    expect(validateWithdrawAmount(NaN, 100)).toEqual({ valid: false, error: null });
    expect(validateWithdrawAmount(0, 100)).toEqual({ valid: false, error: null });
    expect(validateWithdrawAmount(-5, 100)).toEqual({ valid: false, error: null });
  });

  it('should return error with custom message if amount is slightly below balance but exceeds effective max due to gas reserve', () => {
    expect(validateWithdrawAmount(99.99, 100, 1.0, 0.05)).toEqual({
      valid: false,
      error: 'Leave a small buffer for rounding (max: $99.95)',
      errorType: 'INSUFFICIENT_BALANCE',
    });
  });

  it('should return error if amount exceeds available balance completely', () => {
    expect(validateWithdrawAmount(150, 100, 1.0, 0.05)).toEqual({
      valid: false,
      error: 'Exceeds available balance ($100.00)',
      errorType: 'INSUFFICIENT_BALANCE',
    });
  });

  it('should return error if amount is below minWithdrawUsd', () => {
    expect(validateWithdrawAmount(0.5, 100, 1.0, 0.05)).toEqual({
      valid: false,
      error: 'Minimum withdrawal is $1.00',
      errorType: 'AMOUNT_TOO_LOW',
    });
  });

  it('should return valid if all checks pass', () => {
    expect(validateWithdrawAmount(50, 100, 1.0, 0.05)).toEqual({ valid: true, error: null });
  });
});
