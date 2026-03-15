import type { Context } from 'hono';
import type { Logger } from 'pino';
import pino from 'pino';

/**
 * Create a base pino logger.
 * - In production: JSON output, level = info (override via LOG_LEVEL).
 * - In development: pretty-printed output, level = debug (override via LOG_LEVEL).
 */
const isProd = process.env.NODE_ENV === 'production';
const level = (process.env.LOG_LEVEL ?? (isProd ? 'info' : 'debug')) as pino.Level;

const baseLogger = pino(
  {
    level,
    base: {
      pid: process.pid,
      hostname: require('os').hostname(),
    },
    transport: isProd
      ? undefined
      : {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      },
    redact: {
      paths: ['req.headers.authorization', 'req.headers.cookie'],
      censor: '**REDACTED**',
    },
  },
);

/**
 * Returns a logger scoped to the current request (path + method) and
 * extracts the correlation ID from the Hono context (set by middleware).
 * If no ID is present, 'unknown' is used.
 */
export function requestLogger(c: Context): Logger {
  const cid = c.get('correlationId') ?? 'unknown';
  return baseLogger.child({
    correlationId: cid,
    path: c.req.path,
    method: c.req.method
  });
}

export { baseLogger as logger };