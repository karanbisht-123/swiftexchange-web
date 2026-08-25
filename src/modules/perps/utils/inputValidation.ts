/**
 * Input validation utilities for numeric/amount inputs in the trading UI.
 * Keeps business logic separate from components.
 */

/** Matches valid decimal numbers: "", "1", "1.", "1.5", ".5" */
export const DECIMAL_INPUT_REGEX = /^\d*\.?\d*$/;

/** Matches a fully-formed positive number (not just "." or "") */
export const POSITIVE_NUMBER_REGEX = /^(?!0\d)\d+(\.\d+)?$/;

/** Matches an EVM hex address (checksum not enforced here — use ethers.isAddress) */
export const EVM_ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;

/**
 * Returns true if the raw string is a valid decimal input character sequence.
 * Allows empty string, digits, and at most one decimal point.
 */
export function isValidDecimalInput(value: string): boolean {
  return DECIMAL_INPUT_REGEX.test(value);
}

/**
 * Returns true if the string represents a valid positive number greater than zero.
 */
export function isPositiveNumber(value: string): boolean {
  if (!value || !POSITIVE_NUMBER_REGEX.test(value)) return false;
  return parseFloat(value) > 0;
}

/**
 * Returns true if the string is a syntactically valid EVM address.
 * For checksum validation use ethers.isAddress().
 */
export function isValidEvmAddressSyntax(value: string): boolean {
  return EVM_ADDRESS_REGEX.test(value);
}

/**
 * Clamps a numeric string to a given maximum, returning the max as string if exceeded.
 * Returns the original string if it is within range.
 */
export function clampAmountToMax(value: string, max: number): string {
  const num = parseFloat(value);
  if (isNaN(num)) return value;
  if (num > max) return String(max);
  return value;
}

/**
 * Formats a number for display with a fixed number of decimal places.
 * Falls back gracefully on invalid input.
 */
export function formatDisplayAmount(value: string | number, decimals = 4): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '0.00';
  return num.toFixed(decimals);
}

/**
 * Computes the percentage of a total.
 * E.g. pctOf(100, 50) => "50.0000"
 */
export function pctOf(total: number, pct: number, decimals = 4): string {
  return ((total * pct) / 100).toFixed(decimals);
}
