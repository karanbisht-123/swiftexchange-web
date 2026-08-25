export class ExchangeBaseError extends Error {
  public readonly code?: number;

  constructor(message: string, code?: number) {
    super(message);
    this.code = code;
    this.name = this.constructor.name;
    // Maintains proper stack trace for where our error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

export class TransportError extends ExchangeBaseError {
  public readonly status?: number;

  constructor(message: string, status?: number) {
    super(message, status);
    this.status = status;
  }
}

export class RateLimitError extends TransportError {
  constructor(message: string = 'Rate limit exceeded', status: number = 429) {
    super(message, status);
  }
}

export class SigningError extends ExchangeBaseError {
  constructor(message: string) {
    super(message);
  }
}

export class ValidationError extends ExchangeBaseError {
  constructor(message: string) {
    super(message);
  }
}

export class ParsingError extends ExchangeBaseError {
  public readonly rawData?: unknown;

  constructor(message: string, rawData?: unknown) {
    super(message);
    this.rawData = rawData;
  }
}
