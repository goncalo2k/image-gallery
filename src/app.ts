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

app.post('/image', async (c) => {
  /* 
   const res = await fetch("https://cataas.com/cat");
    const blob = await res.arrayBuffer();
    const input = {
      image: [...new Uint8Array(blob)],
      prompt: "Generate a caption for this image",
      max_tokens: 512,
    };
    const response = await env.AI.run(
      "@cf/llava-hf/llava-1.5-7b-hf",
      input
      );
    return new Response(JSON.stringify(response)); */
  return c.text('Got audit!')
})

export default app
