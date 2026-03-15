/* eslint-disable @typescript-eslint/no-invalid-void-type */

import type { Next } from "hono"
import type { AppContext } from "../app";
import { parseCsv } from "../utils/utils"

export function pathMatches(requestPath: string, protectedPath: string): boolean {
    if (protectedPath === '*') { return true }
    return requestPath === protectedPath || requestPath.startsWith(`${protectedPath}/`)
}

export function shouldRequireAuth(c: AppContext): boolean {
    const authEnabled = c.env.ENABLE_AUTH;
    if (!authEnabled) { return false; }

    const protectedEndpoints = parseCsv(c.env.AUTH_ROUTES);

    if (pathMatches(c.req.path, '/') || pathMatches(c.req.path, '/health')) {
        return false;
    }

    if (protectedEndpoints.length === 0) {
        return true;
    }

    return protectedEndpoints.some(endpoint => pathMatches(c.req.path, endpoint));
}

export async function authMiddleware(c: AppContext, next: Next): Promise<Response | void> {
    if (!shouldRequireAuth(c)) {
        return next();
    }

    const clientIdHeader = c.env.CLIENT_ID_HEADER;
    const clientSecretHeader = c.env.CLIENT_SECRET_HEADER;

    const clientId = c.req.header(clientIdHeader);
    const clientSecret = c.req.header(clientSecretHeader);

    const encoder = new TextEncoder();
    const isAuthorized =
        crypto.subtle.timingSafeEqual(encoder.encode(clientId), encoder.encode(c.env.CLIENT_ID)) &&
        crypto.subtle.timingSafeEqual(encoder.encode(clientSecret), encoder.encode(c.env.CLIENT_SECRET))
        
    if (!isAuthorized) {
        return c.json({ errorMessage: 'Unauthorized' }, 401);
    }

    await next();
}