import { Hono } from 'hono'
import imageRoutes from './routes/image.routes';

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


app.route('/images', imageRoutes);

app.get('/', (c) => {
  //TODO: Implement health check
  return c.text('Hello Hono!')
})

export default app
