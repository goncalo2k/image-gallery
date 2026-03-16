import { describe, it, expect, vi, beforeEach } from 'vitest';
import { faker } from '@faker-js/faker';
import type { AppContext } from '../app';
import { loggingMiddleware } from './logger-middleware';

const loggerInfoSpy = vi.hoisted(() => vi.fn());
const requestLoggerMock = vi.hoisted(() => vi.fn(() => ({ info: loggerInfoSpy })));

vi.mock('../utils/logger', () => ({
  requestLogger: requestLoggerMock,
}));

const uuidMock = vi.hoisted(() => vi.fn(() => faker.string.uuid()));
vi.mock('uuid', () => ({ v4: uuidMock }));

const createContext = (options?: { correlationHeader?: string; method?: string; path?: string }) => {
  const headersStore = new Map<string, string>();
  const variables = new Map<string, string>();
  const ctx = {
    req: {
      header: vi.fn().mockImplementation((key: string) => (key === 'X-Correlation-Id' ? options?.correlationHeader : undefined)),
      method: options?.method ?? 'GET',
      path: options?.path ?? faker.internet.url(),
    },
    res: {
      headers: headersStore,
      status: 200,
    },
    set: vi.fn((key: string, value: string) => {
      variables.set(key, value);
    }),
    get: vi.fn((key: string) => variables.get(key)),
    executionCtx: { waitUntil: vi.fn() },
  } as unknown as AppContext;

  return { ctx, headersStore, variables };
};

describe('loggingMiddleware', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    loggerInfoSpy.mockReset();
    requestLoggerMock.mockImplementation(() => ({ info: loggerInfoSpy }));
    uuidMock.mockReturnValue(faker.string.uuid());
  });

  it('uses existing correlation id and logs request lifecycle', async () => {
    const correlationId = faker.string.uuid();
    const { ctx, headersStore, variables } = createContext({ correlationHeader: correlationId });
    const next = vi.fn();
    const dateSpy = vi.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(1020);

    await loggingMiddleware()(ctx, next);

    expect(ctx.req.header).toHaveBeenCalledWith('X-Correlation-Id');
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
    uuidMock.mockReturnValueOnce(generatedId);
    const { ctx, headersStore, variables } = createContext();

    await loggingMiddleware()(ctx, vi.fn());

    expect(headersStore.get('X-Correlation-Id')).toBe(generatedId);
    expect(variables.get('correlationId')).toBe(generatedId);
  });
});
