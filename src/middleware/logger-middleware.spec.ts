import { faker } from '@faker-js/faker';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AppContext } from '../app';
import { loggingMiddleware } from './logger-middleware';

const loggerInfoSpy = vi.hoisted(() => vi.fn());
const requestLoggerMock = vi.hoisted(() => vi.fn(() => ({ info: loggerInfoSpy })));

vi.mock('../utils/logger', () => ({
  requestLogger: requestLoggerMock,
}));

const createContext = (options?: { correlationHeader?: string; method?: string; path?: string }) => {
  const headersStore = new Map<string, string>();
  const variables = new Map<string, string>();
  const headerMock = vi.fn().mockImplementation((key: string) => (key === 'X-Correlation-Id' ? options?.correlationHeader : undefined));
  const setMock = vi.fn((key: string, value: string) => {
    variables.set(key, value);
  });
  const getMock = vi.fn((key: string) => variables.get(key));
  const req = {
    header: headerMock,
    method: options?.method ?? 'GET',
    path: options?.path ?? faker.internet.url(),
  } as unknown as AppContext['req'];
  const res = {
    headers: headersStore,
    status: 200,
  } as unknown as AppContext['res'];

  const ctx: AppContext = {
    req,
    res,
    env: {} as AppContext['env'],
    set: setMock as AppContext['set'],
    get: getMock as AppContext['get'],
    executionCtx: {
      waitUntil: vi.fn((promise: Promise<unknown>) => {
        promise.catch(() => undefined);
      }),
    } as unknown as AppContext['executionCtx'],
    json: (() => Response.json({})) as unknown as AppContext['json'],
  } as unknown as AppContext;

  return { ctx, headersStore, variables, headerMock };
};

describe('loggingMiddleware', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    loggerInfoSpy.mockReset();
    requestLoggerMock.mockImplementation(() => ({ info: loggerInfoSpy }));
  });

  it('uses existing correlation id and logs request lifecycle', async () => {
    const correlationId = faker.string.uuid();
    const { ctx, headersStore, variables, headerMock } = createContext({ correlationHeader: correlationId });
    const next = vi.fn();
    const dateSpy = vi.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(1020);

    await loggingMiddleware()(ctx, next);

    expect(headerMock).toHaveBeenCalledWith('X-Correlation-Id');
    expect(headersStore.get('X-Correlation-Id')).toBe(correlationId);
    expect(variables.get('correlationId')).toBe(correlationId);
    expect(requestLoggerMock).toHaveBeenCalledWith(ctx);
    expect(loggerInfoSpy).toHaveBeenNthCalledWith(1, {
      msg: 'Incoming request',
      method: ctx.req.method,
      path: ctx.req.path,
      correlationId,
    });
    expect(loggerInfoSpy).toHaveBeenNthCalledWith(2, {
      msg: 'Outgoing response',
      status: ctx.res.status,
      durationMs: 20,
      correlationId,
    });
    expect(next).toHaveBeenCalled();
    dateSpy.mockRestore();
  });

  it('generates correlation id when missing', async () => {
    const generatedId = faker.string.uuid();
    interface CryptoWithUUID { randomUUID: () => string }
    const cryptoApi = globalThis as typeof globalThis & { crypto: CryptoWithUUID };
    const randomUuidSpy = vi.spyOn(cryptoApi.crypto, 'randomUUID').mockReturnValueOnce(generatedId);
    const { ctx, headersStore, variables } = createContext();

    await loggingMiddleware()(ctx, vi.fn());

    expect(headersStore.get('X-Correlation-Id')).toBe(generatedId);
    expect(variables.get('correlationId')).toBe(generatedId);
    randomUuidSpy.mockRestore();
  });
});
