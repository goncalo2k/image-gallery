import { Context } from 'hono'
import { ImageService } from '../services/image.service';


export class ImageController {
    constructor(private imageService: ImageService) { }

    async getImages(c: Context): Promise<any> {
        const images = await this.imageService.getImages();
        return c.json(images);
    }

    async getImage(c: Context): Promise<any> {
        const name = String(c.req.param('id'));
        const image = await this.imageService.getImageByName(c.env.ANALOGS_BUCKET, c.env.ANALOGS_METADATA_DB, name);
        const headerName = c.env.ALT_HEADER_NAME;
        if (image && image.description && image.contentType) {
            return new Response(image.file, {
                headers: {
                    'Content-Type': image.contentType,
                    [headerName]: image.description
                },
            })
        }

        c.notFound();
    }

    async uploadImage(c: Context): Promise<any> {
        const body = await c.req.parseBody<ImageUploadRequest>();
        const isUploaded = await this.imageService.uploadImage(c, body);
        return c.json({}, isUploaded ? 201 : 500)
    }

}