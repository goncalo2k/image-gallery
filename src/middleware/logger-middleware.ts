import { Context } from "hono";
import { Bindings, Variables } from "../app";

import { v4 as uuidv4 } from 'uuid';
import { requestLogger } from "../utils/logger";


export const loggingMiddleware = () => {
    return async (c: Context<{ Bindings: Bindings; Variables: Variables }>, next: () => Promise<void>) => {
        const cid = c.req.header('X-Correlation-Id') ?? uuidv4();
        c.set('correlationId', cid);
        c.res.headers.set('X-Correlation-Id', cid);

        const logger = requestLogger(c);

        logger.info({
            msg: 'Incoming request',
            method: c.req.method,
            path: c.req.path,
            query: c.req.query()
        });

        const start = Date.now();
        await next();
        const durationMs = Date.now() - start;

        logger.info({
            msg: 'Outgoing response',
            status: c.res.status,
            durationMs
        });
    };
};