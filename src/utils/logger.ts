import type { Context } from 'hono';
import type { Logger } from 'pino';
import pino from 'pino';

/**
 * Returns a logger scoped to the current request (path + method) and
 * extracts the correlation ID from the Hono context (set by middleware).
 */
export function requestLogger(c: Context): Logger {

  const level = c.env.LOG_LEVEL;
  const baseLogger = pino(
    {
      level,
      base: {
        hostname: 'cloudflare-worker',
      },
      transport: level === 'debug'
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
  const cid = c.get('correlationId') ?? 'unknown';
  return baseLogger.child({
    correlationId: cid,
    path: c.req.path,
    method: c.req.method
  });
}