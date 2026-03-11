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
        if (image) {
            return new Response(image.blob, {
                headers: {
                    'Content-Type': image.contentType || 'application/octet-stream',
                    headerName: image.description
                },
            })
        }

        c.notFound();
    }

    async uploadImage(c: Context) {
        return c.json({}, 201)
    }

}