/* eslint-disable @typescript-eslint/no-invalid-void-type */

import type { Next } from "hono"
import type { AppContext } from "../app";
import { parseCsv } from "../utils/utils"

export function pathMatches(requestPath: string, protectedPath: string): boolean {
    if (protectedPath === '*') { return true }
    return requestPath === protectedPath || requestPath.startsWith(`${protectedPath}/`)
}

const PUBLIC_PATHS = ['/', '/health', '/docs', '/openapi.json'];

export function shouldRequireAuth(c: AppContext): boolean {
    const authEnabled = c.env.ENABLE_AUTH;
    if (!authEnabled) { return false; }

    if (PUBLIC_PATHS.some((publicPath) => pathMatches(c.req.path, publicPath))) {
        return false;
    }
    
    const protectedEndpoints = parseCsv(c.env.AUTH_ROUTES);

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
    if (!clientId || !clientSecret) {
        return c.json({ errorMessage: 'Unauthorized' }, 401);
    }
    const providedClientId = encoder.encode(clientId);
    const storedClientId = encoder.encode(c.env.CLIENT_ID);
    if (providedClientId.byteLength !== storedClientId.byteLength) {
        return c.json({ errorMessage: 'Unauthorized' }, 401);
    }

    const providedClientSecret = encoder.encode(clientSecret);
    const storedClientSecret = encoder.encode(c.env.CLIENT_SECRET);
    if (providedClientSecret.byteLength !== storedClientSecret.byteLength) {
        return c.json({ errorMessage: 'Unauthorized' }, 401);
    }

    const isAuthorized =
        crypto.subtle.timingSafeEqual(providedClientId, storedClientId) &&
        crypto.subtle.timingSafeEqual(providedClientSecret, storedClientSecret)

    if (!isAuthorized) {
        return c.json({ errorMessage: 'Unauthorized' }, 401);
    }

    await next();
}
