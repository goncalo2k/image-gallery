/* eslint-disable @typescript-eslint/no-invalid-void-type */

import type { Next } from "hono"
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { AppContext } from "../app";
import { requestLogger } from "../utils/logger";
import { Environmnents, JWT_HEADER, parseCsv, PUBLIC_PATHS } from "../utils/utils"

export function pathMatches(requestPath: string, protectedPath: string): boolean {
    if (protectedPath === '*') { return true }
    return requestPath === protectedPath || requestPath.startsWith(`${protectedPath}/`)
}



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

    const logger = requestLogger(c);

    if ((!c.env.POLICY_AUD || !c.env.TEAM_DOMAIN) && c.env.ENVIRONMENT === Environmnents.Prod) {
        logger.debug('Failed with unavailable Policy AUD or Team Domain on PROD.');
        return c.json({ errorMessage: 'Unauthorized' }, 401);
    }


    const jwtToken = c.req.header(JWT_HEADER);

    if (!jwtToken) {
        logger.debug('Failed with unavailable auth token.');
        return c.json({ errorMessage: 'Unauthorized' }, 401);
    }
    try {
        // Create JWKS from your team domain
        const JWKS = createRemoteJWKSet(
            new URL(`${c.env.TEAM_DOMAIN}/cdn-cgi/access/certs`),
        );

        await jwtVerify(jwtToken, JWKS, {
            issuer: c.env.TEAM_DOMAIN,
            audience: c.env.POLICY_AUD,
        });

    } catch (error) {
        // Token verification failed
        const message = error instanceof Error ? error.message : "Unknown error";
        logger.debug('Failed with invalid token.');
        return c.json({ errorMessage: 'Unauthorized' }, 401);
    }

    await next();
}
