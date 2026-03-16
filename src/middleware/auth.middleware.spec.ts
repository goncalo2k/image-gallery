/* eslint-disable @typescript-eslint/no-unsafe-assignment */ 

import { faker } from '@faker-js/faker';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Buffer } from 'node:buffer';
import type { AppContext } from '../app';
import { authMiddleware, pathMatches, shouldRequireAuth } from './auth.middleware';

const globalCrypto = (globalThis as typeof globalThis & { crypto?: Crypto }).crypto;
const subtle = globalCrypto?.subtle;
if (subtle && typeof subtle.timingSafeEqual !== 'function') {
  Object.defineProperty(subtle, 'timingSafeEqual', {
    value: (a: BufferSource, b: BufferSource) => {
      const bufferA = Buffer.from(a as ArrayBufferLike);
      const bufferB = Buffer.from(b as ArrayBufferLike);
      if (bufferA.byteLength !== bufferB.byteLength) {
        return false;
      }
      return bufferA.equals(bufferB);
    },
    configurable: true,
    writable: true,
  });
}

const baseEnv = {
  ENABLE_AUTH: true,
  AUTH_ROUTES: '/images',
  CLIENT_ID_HEADER: `x-${faker.string.alphanumeric(8).toLowerCase()}`,
  CLIENT_SECRET_HEADER: `x-${faker.string.alphanumeric(8).toLowerCase()}`,
  CLIENT_ID: faker.string.alphanumeric(12),
  CLIENT_SECRET: faker.string.alphanumeric(14),
};

type HeadersMap = Record<string, string | undefined>;

const createContext = (options?: {
  path?: string;
  headers?: HeadersMap;
  envOverrides?: Partial<typeof baseEnv>;
}): { ctx: AppContext; jsonSpy: ReturnType<typeof vi.fn> } => {
  const headers = options?.headers ?? {};
  const jsonSpy = vi.fn((body, status = 200) => ({ body, status }));

  const ctx: AppContext = {
    req: {
      path: options?.path ?? '/images',
      header: (name: string) => headers[name.toLowerCase()] ?? headers[name],
    } as AppContext['req'],
    env: {
      ...baseEnv,
      ...(options?.envOverrides ?? {}),
    } as AppContext['env'],
    json: jsonSpy as unknown as AppContext['json'],
  } as AppContext;

  return { ctx, jsonSpy };
};

describe('auth.middleware helpers', () => {
  it('matches exact paths and nested routes', () => {
    expect(pathMatches('/images', '/images')).toBe(true);
    expect(pathMatches('/images/abc', '/images')).toBe(true);
    expect(pathMatches('/health', '/images')).toBe(false);
    expect(pathMatches('/any', '*')).toBe(true);
  });

  it('respects ENABLE_AUTH flag and protected routes', () => {
    const { ctx } = createContext({ envOverrides: { ENABLE_AUTH: false } });
    expect(shouldRequireAuth(ctx)).toBe(false);

    const { ctx: rootCtx } = createContext({ path: '/' });
    expect(shouldRequireAuth(rootCtx)).toBe(false);

    const { ctx: docsCtx } = createContext({ path: '/docs' });
    expect(shouldRequireAuth(docsCtx)).toBe(false);

    const { ctx: schemaCtx } = createContext({ path: '/openapi.json' });
    expect(shouldRequireAuth(schemaCtx)).toBe(false);

    const { ctx: protectedCtx } = createContext({ path: '/images' });
    expect(shouldRequireAuth(protectedCtx)).toBe(true);
  });
});

describe('authMiddleware', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('skips auth when disabled', async () => {
    const next = vi.fn();
    const { ctx } = createContext({ envOverrides: { ENABLE_AUTH: false } });

    await authMiddleware(ctx, next);
    expect(next).toHaveBeenCalled();
  });

  it('returns 401 when headers are missing', async () => {
    const next = vi.fn();
    const { ctx, jsonSpy } = createContext();

    const response = await authMiddleware(ctx, next);

    expect(response).toEqual({ body: { errorMessage: 'Unauthorized' }, status: 401 });
    expect(jsonSpy).toHaveBeenCalledWith({ errorMessage: 'Unauthorized' }, 401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when credentials are invalid', async () => {
    const headers = {
      [baseEnv.CLIENT_ID_HEADER]: baseEnv.CLIENT_ID,
      [baseEnv.CLIENT_SECRET_HEADER]: faker.string.alphanumeric(8),
    };
    const { ctx, jsonSpy } = createContext({ headers });

    const response = await authMiddleware(ctx, vi.fn());

    expect(response).toEqual({ body: { errorMessage: 'Unauthorized' }, status: 401 });
    expect(jsonSpy).toHaveBeenCalledTimes(1);
  });

  it('invokes next when credentials are valid', async () => {
    const headers = {
      [baseEnv.CLIENT_ID_HEADER]: baseEnv.CLIENT_ID,
      [baseEnv.CLIENT_SECRET_HEADER]: baseEnv.CLIENT_SECRET,
    };
    const { ctx } = createContext({ headers });
    const next = vi.fn();

    await authMiddleware(ctx, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});
