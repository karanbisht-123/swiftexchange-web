import { cleanup } from '@testing-library/react';

import '@testing-library/jest-dom/vitest';
import { Buffer } from 'node:buffer';
import { afterAll, afterEach, beforeAll } from 'vitest';

import { server } from './mocks/server';

// Polyfill global and Buffer for the testing environment
if (typeof globalThis !== 'undefined') {
  (globalThis as any).Buffer = (globalThis as any).Buffer || Buffer;
}
if (typeof window !== 'undefined') {
  (window as any).Buffer = (window as any).Buffer || Buffer;
  (window as any).global = (window as any).global || window;
}
if (typeof global !== 'undefined') {
  (global as any).Buffer = (global as any).Buffer || Buffer;
}

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'warn' });
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});
