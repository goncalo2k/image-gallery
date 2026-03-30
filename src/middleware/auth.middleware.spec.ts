/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import { faker } from '@faker-js/faker';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppContext } from '../app';

const {
  createRemoteJWKSetMock,
  jwtVerifyMock,
  requestLoggerMock,
  loggerDebugMock,
} = vi.hoisted(() => ({
  createRemoteJWKSetMock: vi.fn(),
  jwtVerifyMock: vi.fn(),
  requestLoggerMock: vi.fn(),
  loggerDebugMock: vi.fn(),
}));

vi.mock('jose', () => ({
  createRemoteJWKSet: createRemoteJWKSetMock,
  jwtVerify: jwtVerifyMock,
}));

vi.mock('../utils/logger', () => ({
  requestLogger: requestLoggerMock,
}));

import { Environmnents, JWT_HEADER } from '../utils/utils';
import { authMiddleware, pathMatches, shouldRequireAuth } from './auth.middleware';

const baseEnv = {
  ENABLE_AUTH: true,
  AUTH_ROUTES: '/images',
  LOG_LEVEL: 'info',
  POLICY_AUD: faker.string.alphanumeric(16),
  TEAM_DOMAIN: 'https://example.cloudflareaccess.com',
  ENVIRONMENT: Environmnents.Prod,
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
    vi.clearAllMocks();
    requestLoggerMock.mockReturnValue({ debug: loggerDebugMock });
    createRemoteJWKSetMock.mockReturnValue('mock-jwks');
    jwtVerifyMock.mockResolvedValue({ payload: {} });
  });

  it('skips auth when disabled', async () => {
    const next = vi.fn();
    const { ctx } = createContext({ envOverrides: { ENABLE_AUTH: false } });

    await authMiddleware(ctx, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(jwtVerifyMock).not.toHaveBeenCalled();
  });

  it('returns 401 in prod when access settings are missing', async () => {
    const next = vi.fn();
    const { ctx, jsonSpy } = createContext({ envOverrides: { POLICY_AUD: '' } });

    const response = await authMiddleware(ctx, next);

    expect(response).toEqual({ body: { errorMessage: 'Unauthorized' }, status: 401 });
    expect(jsonSpy).toHaveBeenCalledWith({ errorMessage: 'Unauthorized' }, 401);
    expect(loggerDebugMock).toHaveBeenCalledWith('Failed with unavailable Policy AUD or Team Domain on PROD.');
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when jwt header is missing', async () => {
    const next = vi.fn();
    const { ctx, jsonSpy } = createContext();

    const response = await authMiddleware(ctx, next);

    expect(response).toEqual({ body: { errorMessage: 'Unauthorized' }, status: 401 });
    expect(jsonSpy).toHaveBeenCalledWith({ errorMessage: 'Unauthorized' }, 401);
    expect(loggerDebugMock).toHaveBeenCalledWith('Failed with unavailable auth token.');
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when jwt verification fails', async () => {
    const headers = {
      [JWT_HEADER]: 'invalid.jwt.token',
    };
    jwtVerifyMock.mockRejectedValueOnce(new Error('invalid token'));
    const { ctx, jsonSpy } = createContext({ headers });

    const response = await authMiddleware(ctx, vi.fn());

    expect(response).toEqual({ body: { errorMessage: 'Unauthorized' }, status: 401 });
    expect(createRemoteJWKSetMock).toHaveBeenCalledWith(new URL('https://example.cloudflareaccess.com/cdn-cgi/access/certs'));
    expect(jsonSpy).toHaveBeenCalledTimes(1);
    expect(loggerDebugMock).toHaveBeenCalledWith('Failed with invalid token.: invalid token');
  });

  it('invokes next when jwt is valid', async () => {
    const headers = {
      [JWT_HEADER]: 'valid.jwt.token',
    };
    const { ctx } = createContext({ headers });
    const next = vi.fn();

    await authMiddleware(ctx, next);

    expect(createRemoteJWKSetMock).toHaveBeenCalledWith(new URL('https://example.cloudflareaccess.com/cdn-cgi/access/certs'));
    expect(jwtVerifyMock).toHaveBeenCalledWith('valid.jwt.token', 'mock-jwks', {
      issuer: 'https://example.cloudflareaccess.com',
      audience: baseEnv.POLICY_AUD,
    });
    expect(next).toHaveBeenCalledTimes(1);
  });
});
