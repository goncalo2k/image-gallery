import { Context } from 'hono'
import { ImageService } from '../services/image.service';


export class ImageController {
    constructor(private imageService: ImageService) { }

    async getImages(c: Context) {
        const images = await this.imageService.getImages();
        return c.json(images);
    }

    async getImage(c: Context): Promise<any> {
        const name = String(c.req.param('name'))
        const image = await this.imageService.getImageByName(c, name);
        const headerName = c.env.ALT_HEADER_NAME;
        if (image) {
            return new Response(image.blob, {
                headers: {
                    'Content-Type': image.contentType || 'application/octet-stream',
                    [headerName]: image.description
                },
            })
        }

        c.notFound();
    }

    async uploadImage(c: Context) {
        /* this.imageService.uploadImage() 
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
        return c.json({}, 201)
    }

}