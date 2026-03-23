// Input sanitisation

export const validateNumberInput = (value: string): string => {
  const sanitized = value.replace(/[^0-9.]/g, '');
  const parts = sanitized.split('.');
  if (parts.length > 2) {
    return `${parts[0]}.${parts.slice(1).join('')}`;
  }
  return sanitized;
};

//  Error taxonomy

export type ValidationErrorType = 'INSUFFICIENT_BALANCE' | 'AMOUNT_TOO_LOW' | 'INVALID_AMOUNT';

export interface ValidationResult {
  valid: boolean;
  error: string | null;
  errorType?: ValidationErrorType;
}

// Deposit validation

export function validateDepositAmount(
  amountHuman: number,
  walletBalance: number,
  usdEquivalent: number | null | undefined,
  minDepositUsd = 1
): ValidationResult {
  if (isNaN(amountHuman) || amountHuman <= 0) {
    return { valid: false, error: null };
  }

  if (amountHuman > walletBalance) {
    return {
      valid: false,
      error: 'Amount exceeds wallet balance',
      errorType: 'INSUFFICIENT_BALANCE',
    };
  }
  if (usdEquivalent != null && usdEquivalent > 0 && usdEquivalent < minDepositUsd) {
    return {
      valid: false,
      error: `Minimum deposit is $${minDepositUsd.toFixed(2)}`,
      errorType: 'AMOUNT_TOO_LOW',
    };
  }

  return { valid: true, error: null };
}

// Withdrawal validation

export function validateWithdrawAmount(
  amountHuman: number,
  availableBalance: number,
  minWithdrawUsd = 1,
  gasReserveUsd = 0.01
): ValidationResult {
  if (isNaN(amountHuman) || amountHuman <= 0) {
    return { valid: false, error: null };
  }
  const effectiveMax = Math.max(0, availableBalance - gasReserveUsd);

  if (amountHuman > effectiveMax) {
    if (amountHuman <= availableBalance) {
      return {
        valid: false,
        error: `Leave a small buffer for rounding (max: $${effectiveMax.toFixed(2)})`,
        errorType: 'INSUFFICIENT_BALANCE',
      };
    }
    return {
      valid: false,
      error: `Exceeds available balance ($${availableBalance.toFixed(2)})`,
      errorType: 'INSUFFICIENT_BALANCE',
    };
  }

  if (amountHuman < minWithdrawUsd) {
    return {
      valid: false,
      error: `Minimum withdrawal is $${minWithdrawUsd.toFixed(2)}`,
      errorType: 'AMOUNT_TOO_LOW',
    };
  }

  return { valid: true, error: null };
}
