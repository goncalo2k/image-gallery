import { Hono } from 'hono'
import { cors } from 'hono/cors';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware } from './middleware/auth.middleware';
import { corsMiddleware } from './middleware/cors.middleware';
import { loggingMiddleware } from './middleware/logger-middleware';
import imageRoutes from './routes/image.routes';

export interface Bindings {
  ANALOGS_BUCKET: R2Bucket,
  AI: Ai,
  ANALOGS_METADATA_DB: D1Database,
  ALT_HEADER_NAME: string,
  CLIENT_ID_HEADER: string,
  CLIENT_SECRET_HEADER: string,
  CLIENT_ID: string,
  CLIENT_SECRET: string,
  ALLOWED_ORIGINS: string,
  ENABLE_AUTH: boolean,
  AUTH_ROUTES: string,
}

export interface Variables {
  correlationId: string
}

const app = new Hono<{ Bindings: Bindings, Variables: Variables }>();

app.use('*', loggingMiddleware());
app.use('*', corsMiddleware);
app.use('*', authMiddleware)


app.route('/images', imageRoutes);

app.get('/', (c) => {
  return c.json({
    message: 'service healthy',
    timestamp: new Date().toISOString()
  }, 200)
})


export default app;