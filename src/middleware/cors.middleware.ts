/* eslint-disable @typescript-eslint/no-invalid-void-type */
/* eslint-disable @typescript-eslint/no-unsafe-argument */

import type { Next } from 'hono'
import { cors } from 'hono/cors'
import type { AppContext } from '../app';
import { parseCsv } from '../utils/utils';



export async function corsMiddleware(c: AppContext, next: Next): Promise<Response | void> {

    const allowedOrigins = parseCsv(c.env.ALLOWED_ORIGINS);

    const corsHandler = cors({
        origin: (origin) => {
            // Requests without Origin header (curl, backend services)
            if (!origin) { return ''; }

            // Allow everything if wildcard
            if (allowedOrigins.includes('*')) { return origin; }

            // Exact match
            if (allowedOrigins.includes(origin)) { return origin; }

            return '';
        },
        allowHeaders: [
            'Content-Type',
            c.env.CLIENT_ID_HEADER,
            c.env.CLIENT_SECRET_HEADER
        ].filter(Boolean),
        allowMethods: ['GET', 'POST', 'DELETE'],
        credentials: false
    });

    return corsHandler(c, next);
}