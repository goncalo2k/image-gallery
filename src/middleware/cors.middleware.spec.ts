/* eslint-disable @typescript-eslint/no-unsafe-assignment */    
/* eslint-disable @typescript-eslint/no-unsafe-call */    

import { faker } from '@faker-js/faker';
import type { cors } from 'hono/cors';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AppContext } from '../app';
import { corsMiddleware } from './cors.middleware';

const handlerSpy = vi.fn();
let capturedConfig: Parameters<typeof cors>[0] | undefined;

vi.mock('hono/cors', () => ({
  cors: vi.fn((config) => {
    capturedConfig = config;
    return handlerSpy;
  }),
}));

const createContext = (overrides?: Partial<AppContext['env']>): AppContext => {
  const env = {
    ALLOWED_ORIGINS: faker.internet.url(),
    CLIENT_ID_HEADER: faker.string.alphanumeric(8),
    CLIENT_SECRET_HEADER: faker.string.alphanumeric(8),
    ...(overrides ?? {}),
  } as AppContext['env'];

  const ctx: AppContext = {
    req: {} as AppContext['req'],
    res: {} as AppContext['res'],
    env,
    json: (() => Response.json({})) as unknown as AppContext['json'],
  } as AppContext;

  return ctx;
};

describe('corsMiddleware', () => {
  beforeEach(() => {
    handlerSpy.mockReset();
    handlerSpy.mockImplementation(async (_ctx, next) => {
      await next?.();
    });
    capturedConfig = undefined;
  });

  it('configures allowed origins with exact matches', async () => {
    const allowedOrigin = faker.internet.url();
    const disallowedOrigin = faker.internet.url();
    const ctx = createContext({
      ALLOWED_ORIGINS: `${allowedOrigin}, ${faker.internet.url()}`,
    });
    const next = vi.fn();

    await corsMiddleware(ctx, next);

    expect(capturedConfig).toBeTruthy();
    expect(capturedConfig?.allowHeaders).toEqual(['Content-Type']);
    expect(capturedConfig?.allowMethods).toEqual(['GET', 'POST', 'DELETE']);

    expect(typeof capturedConfig?.origin).toBe('function');
    const originFn = capturedConfig?.origin as (origin: string | undefined) => string;
    expect(originFn(allowedOrigin)).toBe(allowedOrigin);
    expect(originFn(disallowedOrigin)).toBe('');
    expect(originFn(undefined)).toBe('');

    expect(handlerSpy).toHaveBeenCalledWith(ctx, next);
    expect(next).toHaveBeenCalled();
  });

  it('allows wildcard origins', async () => {
    const origin = faker.internet.url();
    const ctx = createContext({ ALLOWED_ORIGINS: '*' });

    await corsMiddleware(ctx, vi.fn());

    expect(typeof capturedConfig?.origin).toBe('function');
    const originFn = capturedConfig?.origin as (value: string) => string;
    expect(originFn(origin)).toBe(origin);
  });
});
