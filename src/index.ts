import { Hono } from 'hono'

type Bindings = {
  ANALOGS_BUCKET: R2Bucket
}

const app = new Hono<{ Bindings: Bindings }>();

app.get('/', (c) => {
  return c.text('Hello Hono!')
})

app.get('/:imageName', async (c) => {
  const key = c.req.param('imageName')

  const object = await c.env.ANALOGS_BUCKET.get(key)

  if (!object) {
    return c.notFound()
  }

  return new Response(object.body)
})

app.get('/audit', (c) => {
  return c.text('Got audit!')
})

export default app
