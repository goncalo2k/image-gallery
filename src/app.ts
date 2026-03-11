import { Hono } from 'hono'
import imageRoutes from './routes/image.routes';

type Bindings = {
  ANALOGS_BUCKET: R2Bucket,
  ALT_HEADER_NAME: string,
  AI: Ai,
  ANALOGS_METADATA_DB: D1Database,
}

const app = new Hono<{ Bindings: Bindings }>();


app.route('/image', imageRoutes);

app.get('/', (c) => {
  //TODO: Implement health check
  return c.text('Hello Hono!')
})

app.get('/audit', async (c) => {
  //TODO: Implement audit check (fetch all of the entries on R2 and all the D1 metadata)
  return c.text('Got audit!')
})

export default app
