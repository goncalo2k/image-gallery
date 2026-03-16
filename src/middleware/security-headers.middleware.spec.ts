import { describe, it, expect, vi } from 'vitest';
import type { AppContext } from '../app';
import { securityHeadersMiddleware } from './security-headers.middleware';

const createContext = () => {
  const headers = new Map<string, string>();
  const ctx = {
    req: {
      path: '/',
    },
    res: {
      headers,
    },
  } as unknown as AppContext;
  const next = vi.fn();
  return { ctx, headers, next };
};

describe('securityHeadersMiddleware', () => {
  it('applies default headers for api routes', async () => {
    const { ctx, headers, next } = createContext();

    headers.set = headers.set.bind(headers);
    headers.get = headers.get.bind(headers);

    await securityHeadersMiddleware()(ctx, next);

    expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(headers.get('Content-Security-Policy')).toBe("default-src 'self'; img-src 'self' data: https:;");
    expect(next).toHaveBeenCalled();
  });

  it('relaxes CSP for swagger docs', async () => {
    const { ctx, headers, next } = createContext();
    ctx.req.path = '/docs';

    headers.set = headers.set.bind(headers);
    headers.get = headers.get.bind(headers);

    await securityHeadersMiddleware()(ctx, next);

    expect(headers.get('Content-Security-Policy')).toBe([
      "default-src 'self'",
      "img-src 'self' data: https:",
      "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
      "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
      "connect-src 'self' https://cdn.jsdelivr.net",
    ].join('; '));
  });
});
