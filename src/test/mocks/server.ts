import { setupServer } from 'msw/node';

import { handlers } from './handlers';

// Setup Mock Service Worker (MSW) server with the given request handlers.
export const server = setupServer(...handlers);
