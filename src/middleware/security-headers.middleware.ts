import type { Context, Next } from 'hono'
import type { Bindings, Variables } from '../app';

type AppContext = Context<{ Bindings: Bindings; Variables: Variables }>

export const securityHeadersMiddleware = () => {
  return async (c: AppContext, next: Next) => {
    c.res.headers.set('X-Content-Type-Options', 'nosniff');
    c.res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

    const swaggerPaths = ['/docs'];
    const swaggerCsp = [
      "default-src 'self'",
      "img-src 'self' data: https:",
      "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
      "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
      "connect-src 'self' https://cdn.jsdelivr.net",
    ].join('; ');

    const defaultCsp = "default-src 'self'; img-src 'self' data: https:;";

    const shouldRelaxForSwagger = swaggerPaths.includes(c.req.path);
    c.res.headers.set('Content-Security-Policy', shouldRelaxForSwagger ? swaggerCsp : defaultCsp);

    await next();
  }
}
