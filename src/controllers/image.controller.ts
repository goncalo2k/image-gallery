import type { Context } from 'hono'
import type { ImageService } from '../services/image.service';
import type { ImageMapper } from '../utils/image-mapper';
import { requestLogger } from '../utils/logger';

export class ImageController {
    constructor(private imageService: ImageService, private mapperService: ImageMapper,) { }

    async getImagesAudit(c: Context): Promise<Response> {
        try {
            const auditLogs = await this.imageService.getImagesAuditLogs(c);
            return c.json({ data: auditLogs });
        } catch (error) {
            const logger = requestLogger(c);
            logger.error(`Failed to get audit logs: ${error}`);
            return c.json({ errorMessage: 'Failed to get audit logs.' }, 500)
        }
    }

    async getImagesMetada(c: Context): Promise<Response> {
        try {
            const imagesReponse = await this.imageService.getImagesMetadata(c);
            return c.json(imagesReponse, 200);
        } catch (error) {
            const logger = requestLogger(c);
            logger.error(`Failed to get images: ${error}`);
            return c.json({ errorMessage: 'Failed to get images.' }, 500)
        }
    }

    async getImage(c: Context): Promise<Response> {
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
                        'ETag': `"${name}-${image.createdAt}"`,
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
            return c.json({ errorMessage: `Failed to get image with name ${name}.` }, 500)
        } catch (error) {
            const logger = requestLogger(c);
            logger.error(`Failed to get image named ${name}: ${error}`);
            return c.json({ errorMessage: 'Failed to get image.' }, 500)
        }
    }
    //TODO: Add support for multipartuploads?
    async uploadImage(c: Context): Promise<Response> {
        try {
            const formData = await c.req.formData();
            const request = this.mapperService.mapFormDataToImageUploadFileRequest(formData);
            const uploadResponse = await this.imageService.uploadImage(c, request);
            return c.json(uploadResponse, !uploadResponse.errorMessage ? (uploadResponse.status ?? 201) : 500);
        } catch (error) {
            const logger = requestLogger(c);
            logger.error(`Failed to upload image from file: ${error}`);
            return c.json({ errorMessage: `Failed to upload image from file: ${error}` }, 500)
        }
    }

    //TODO: Add support for multipartuploads?
    async uploadExternalSourceImage(c: Context): Promise<Response> {
        try {
            const formData = await c.req.formData();
            const request = this.mapperService.mapFormDataToImageUploadUrlRequest(formData);
            const uploadResponse = await this.imageService.uploadExternalImage(c, request);
            return c.json(uploadResponse, !uploadResponse.errorMessage ? (uploadResponse.status ?? 201) : 500);
        } catch (error) {
            const logger = requestLogger(c);
            logger.error(`Failed to upload image from external source: ${error}`);
            return c.json({ errorMessage: 'Failed to upload image from external source.' }, 500)
        }
    }

    async deleteImage(c: Context): Promise<Response> {
        const name = String(c.req.param('name'));
        try {
            const deletedResponse = await this.imageService.deleteImage(c, name);
            if (deletedResponse.status === 500) {throw Error(`Couldn't delete image.`);}
            return c.json(undefined, deletedResponse.status);
        }
        catch (error) {
            const logger = requestLogger(c);
            logger.error(`Failed to delete image named ${name}: ${error}`);
            return c.json({ errorMessage: 'Failed to delete image.' }, 500)
        }
    }
}