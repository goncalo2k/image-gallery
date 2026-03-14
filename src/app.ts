import { Hono } from 'hono'
import imageRoutes from './routes/image.routes';
// src/app.ts (add near the top, after imports)
import { v4 as uuidv4 } from 'uuid';

interface Bindings {
  ANALOGS_BUCKET: R2Bucket,
  AI: Ai,
  ANALOGS_METADATA_DB: D1Database,
  ALT_HEADER_NAME: string,
  CLIENT_ID_HEADER: string,
  CLIENT_SECRET_HEADER: string,
  CLIENT_ID: string,
  CLIENT_SECRET: string,
}

const app = new Hono<{ Bindings: Bindings }>();

app.use('*', async (c, next) => {
  const cid = c.req.header('X-Correlation-Id') ?? uuidv4();
  // store it on the context for later use (logger, handlers, etc.)
  c.set('correlationId', cid);
  // make sure it flows back to the client
  c.res.headers.set('X-Correlation-Id', cid);
  await next();
});


app.route('/images', imageRoutes);

app.get('/', (c) => {
  //TODO: Implement health check
  return c.text('Hello Hono!')
})

export default app
