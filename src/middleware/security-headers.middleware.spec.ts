import { describe, it, expect, vi } from 'vitest';
import { securityHeadersMiddleware } from './security-headers.middleware';

const createContext = () => {
  const headers = new Map<string, string>();
  const ctx = {
    res: {
      headers,
    },
  } as any;
  const next = vi.fn();
  return { ctx, headers, next };
};

describe('securityHeadersMiddleware', () => {
  it('applies security headers before calling next', async () => {
    const { ctx, headers, next } = createContext();

    headers.set = headers.set.bind(headers);
    headers.get = headers.get.bind(headers);

    await securityHeadersMiddleware()(ctx, next);

    expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(headers.get('Content-Security-Policy')).toBe("default-src 'self'; img-src 'self' data: https:;");
    expect(next).toHaveBeenCalled();
  });
});
