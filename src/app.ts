import { swaggerUI } from '@hono/swagger-ui';
import type { Context } from 'hono';
import { Hono } from 'hono'
import type pino from 'pino';
import { buildRuntimeOpenApiSpec } from './docs/openapi';
import { authMiddleware } from './middleware/auth.middleware';
import { corsMiddleware } from './middleware/cors.middleware';
import { loggingMiddleware } from './middleware/logger-middleware';
import { securityHeadersMiddleware } from './middleware/security-headers.middleware';
import imageRoutes from './routes/image.routes';
import { requestLogger } from './utils/logger';

export type AppContext = Context<AppEnv>;

export interface AppEnv {
  Bindings: Bindings;
  Variables: Variables;
};

export interface Bindings {
  ANALOGS_BUCKET: R2Bucket,
  AI: Ai,
  IMAGES: ImagesBinding,
  MAX_UPLOAD_SIZE_MB: number,
  ANALOGS_METADATA_DB: D1Database,
  ALT_HEADER_NAME: string,
  CLIENT_ID_HEADER: string,
  CLIENT_SECRET_HEADER: string,
  CLIENT_ID: string,
  CLIENT_SECRET: string,
  ALLOWED_ORIGINS: string,
  ENABLE_AUTH: boolean,
  AUTH_ROUTES: string,
  LOG_LEVEL: pino.Level
}

export interface Variables {
  correlationId: string
}

const app = new Hono<{ Bindings: Bindings, Variables: Variables }>();

app.use('*', loggingMiddleware());
app.use('*', corsMiddleware);
app.use('*', authMiddleware);
app.use('*', securityHeadersMiddleware());

app.get('/openapi.json', (c) => c.json(buildRuntimeOpenApiSpec(c)));
app.get('/docs', swaggerUI({ url: '/openapi.json', title: 'Image Gallery API Docs' }));

app.route('/images', imageRoutes);

app.get('/health', (c) => {
  return c.json({
    message: 'service healthy',
    timestamp: new Date().toISOString()
  }, 200)
})

app.onError((err, c) => {
  const logger = requestLogger(c);
  logger.error({ err }, 'Unhandled application error')
  return c.json({ errorMessage: 'Internal Server Error' }, 500)
})

export default app;
