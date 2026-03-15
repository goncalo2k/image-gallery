import type { Context } from 'hono'
import type { ImageService } from '../services/image.service';
import type { ImageMapper } from '../utils/image-mapper';
import { requestLogger } from '../utils/logger';


export class ImageController {
    constructor(private imageService: ImageService, private mapperService: ImageMapper,) { }

    //TODO: 
    async getImagesAudit(c: Context): Promise<any> {
        try {
            return;
        }
        catch (error) {
            const logger = requestLogger(c);
            logger.error(`Failed to get audit logs: ${error}`);
            return c.json({ message: 'Failed to get audit logs.' }, 500)
        }
    }
    //Add auth
    async getImages(c: Context): Promise<any> {
        try {
            const images = await this.imageService.getImagesMetadata(c);
            return c.json(images);
        } catch (error) {
            const logger = requestLogger(c);
            logger.error(`Failed to get images: ${error}`);
            return c.json({ message: 'Failed to get images.' }, 500)
        }
    }

    async getImage(c: Context): Promise<any> {
        const name = String(c.req.param('name'));
        try {
            const image = await this.imageService.getImageByName(c.env.ANALOGS_BUCKET, c.env.ANALOGS_METADATA_DB, name);
            const headerName = c.env.ALT_HEADER_NAME;
            if (image?.description && image.contentType) {
                const response = new Response(image.file, {
                    headers: {
                        'Content-Type': image.contentType,
                        [headerName]: image.description,
                        'Cache-Control': 'public, max-age=31536000, immutable',
                        'ETag': `"${name}-${image.updatedAt}"`,
                        'Accept-Ranges': 'bytes'
                    },
                })
                try {
                    c.executionCtx.waitUntil(
                        caches.default.put(c.req.raw, response.clone()).catch(cacheError => {
                            console.warn('Failed to cache image:', cacheError);
                        })
                    );
                } catch (cacheError) {
                    console.warn('Failed to cache image:', cacheError);
                }
                return response;

            }
            return c.notFound();
        } catch (error) {
            const logger = requestLogger(c);
            logger.error(`Failed to get image named ${name}: ${error}`);
            return c.json({ message: 'Failed to get image.' }, 500)
        }
    }
    //TODO: Add support for multipartuploads?
    //Add optional auth with feature flag
    async uploadImage(c: Context): Promise<any> {
        try {
            const formData = await c.req.formData();
            const request = this.mapperService.mapFormDataToImageUploadFileRequest(formData);
            const isUploaded = await this.imageService.uploadImage(c, request);
            return c.json({ message: isUploaded ? 'Successfully uploaded image.' : 'Failed to upload image from file.' }, isUploaded ? 201 : 500);
        } catch (error) {
            const logger = requestLogger(c);
            logger.error(`Failed to upload image from file: ${error}`);
            return c.json({ message: 'Failed to upload image from file.' }, 500)
        }
    }

    //Add optional auth with feature flag
    async uploadExternalSourceImage(c: Context): Promise<any> {
        try {
            const formData = await c.req.formData();
            const request = this.mapperService.mapFormDataToImageUploadUrlRequest(formData);
            const isUploaded = await this.imageService.uploadExternalImage(c, request);
            return c.json({ message: isUploaded ? 'Successfully uploaded image.' : 'Failed to upload image from external source.' }, isUploaded ? 201 : 500)
        } catch (error) {
            const logger = requestLogger(c);
            logger.error(`Failed to upload image from external source: ${error}`);
            return c.json({ message: 'Failed to upload image from external source.' }, 500)
        }
    }

    async deleteImage(c: Context): Promise<any> {
        const name = String(c.req.param('name'));
        try {
            await this.imageService.deleteImage(c, name);
        }
        catch (error) {
            const logger = requestLogger(c);
            logger.error(`Failed to delete image named ${name}: ${error}`);
            return c.json({ message: 'Failed to delete image.' }, 500)
        }
    }
}