import type { Logger } from 'pino';
import pino from 'pino';
import type { AppContext } from '../app';

/**
 * Returns a request-scoped logger that automatically injects
 * correlationId/path/method via pino's mixin hook, keeping
 * each log entry on a single line without manual merging.
 */
export function requestLogger(c: AppContext): Logger {
  const level = (c.env.LOG_LEVEL ?? 'info') as string;

  return pino({
    level,
    base: {
      hostname: 'cloudflare-worker',
    },
    mixin() {
      return {
        correlationId: c.get('correlationId') || 'unknown',
        path: c.req.path,
        method: c.req.method,
      };
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
  });
}
