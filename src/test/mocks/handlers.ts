import { type HttpHandler } from 'msw';

/**
 * Global MSW (Mock Service Worker) request handlers for testing.
 * Intercepts network calls during tests to prevent unmocked external requests.
 *
 * Add application-wide default mock responses here.
 * Test-specific overrides can be added inside tests using `server.use(...)`.
 */
export const handlers: HttpHandler[] = [];
