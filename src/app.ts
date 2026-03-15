import { Hono } from 'hono'
import imageRoutes from './routes/image.routes';
// src/app.ts (add near the top, after imports)
import { v4 as uuidv4 } from 'uuid';
import { cors } from 'hono/cors';
import { requestLogger } from './utils/logger';
import { loggingMiddleware } from './middleware/logger-middleware';

export interface Bindings {
  ANALOGS_BUCKET: R2Bucket,
  AI: Ai,
  ANALOGS_METADATA_DB: D1Database,
  ALT_HEADER_NAME: string,
  CLIENT_ID_HEADER: string,
  CLIENT_SECRET_HEADER: string,
  CLIENT_ID: string,
  CLIENT_SECRET: string,
}

export interface Variables {
  correlationId: string
}


const app = new Hono<{ Bindings: Bindings, Variables: Variables }>();

app.use('*', cors());
app.use('*', loggingMiddleware());

app.route('/images', imageRoutes);

app.get('/', (c) => {
  return c.json({
    message: 'service healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  }, 200)
})

export default app
