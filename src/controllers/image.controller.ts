import type { Context } from 'hono'
import type { ImageService } from '../services/image.service';
import type { ImageMapper } from '../utils/image-mapper';


export class ImageController {
    constructor(private imageService: ImageService, private mapperService: ImageMapper) { }

    //TODO: 
    async getImagesAudit(c: Context): Promise<any> {
        return;
    }
    //Add auth
    async getImages(c: Context): Promise<any> {
        const images = await this.imageService.getImagesMetadata(c);
        return c.json(images);
    }

    //TODO: Add Cache API usage and headers
    async getImage(c: Context): Promise<any> {
        const name = String(c.req.param('name'));
        const image = await this.imageService.getImageByName(c.env.ANALOGS_BUCKET, c.env.ANALOGS_METADATA_DB, name);
        const headerName = c.env.ALT_HEADER_NAME;
        if (image?.description && image.contentType) {
            return new Response(image.file, {
                headers: {
                    'Content-Type': image.contentType,
                    [headerName]: image.description
                },
            })
        }

        c.notFound();
    }

    //Add optional auth with feature flag
    async uploadImage(c: Context): Promise<any> {
        const formData = await c.req.formData();
        const request = this.mapperService.mapFormDataToImageUploadFileRequest(formData);
        const isUploaded = await this.imageService.uploadImage(c, request);
        return c.json({}, isUploaded ? 201 : 500)
    }

    //Add optional auth with feature flag
    async uploadExternalSourceImage(c: Context): Promise<any> {
        const formData = await c.req.formData();
        const request = this.mapperService.mapFormDataToImageUploadUrlRequest(formData);
        const isUploaded = await this.imageService.uploadExternalImage(c, request);
        return c.json({}, isUploaded ? 201 : 500)
    }
}