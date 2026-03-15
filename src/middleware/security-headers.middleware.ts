import type { Context, Next } from 'hono'
import type { Bindings, Variables } from '../app';

type AppContext = Context<{ Bindings: Bindings; Variables: Variables }>

export const securityHeadersMiddleware = () => {
  return async (c: AppContext, next: Next) => {
    // Security headers
    c.res.headers.set('X-Content-Type-Options', 'nosniff');
    c.res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

    c.res.headers.set('Content-Security-Policy', "default-src 'self'; img-src 'self' data: https:;");
    
    await next();
  }
}