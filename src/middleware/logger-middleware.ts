import type { AppContext } from "../app";

import { requestLogger } from "../utils/logger";


export const loggingMiddleware = () => {
    return async (c: AppContext, next: () => Promise<void>) => {
        const cid = c.req.header('X-Correlation-Id') ?? crypto.randomUUID();
        c.set('correlationId', cid);
        c.res.headers.set('X-Correlation-Id', cid);

        const logger = requestLogger(c);

        logger.info({
            msg: 'Incoming request',
            method: c.req.method,
            path: c.req.path,
            correlationId: c.get('correlationId')
        });

        const start = Date.now();
        await next();
        const durationMs = Date.now() - start;

        logger.info({
            msg: 'Outgoing response',
            status: c.res.status,
            durationMs,
            correlationId: c.get('correlationId')
        });
    };
};