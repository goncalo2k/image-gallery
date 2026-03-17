import type { AppContext } from '../app';
import type { ImageService } from '../services/image.service';
import type { ImageMapper } from '../utils/image-mapper';
import { requestLogger } from '../utils/logger';
import { parseErrorMessage } from '../utils/utils';

export class ImageController {
    constructor(private imageService: ImageService, private mapperService: ImageMapper,) { }

    async getImagesAudit(c: AppContext): Promise<Response> {
        try {
            const auditLogs = await this.imageService.getImagesAuditLogs(c);
            return c.json({ data: auditLogs });
        } catch (error: unknown) {
            const logger = requestLogger(c);
            const errorMessage = parseErrorMessage(error);
            logger.error(`Failed to get audit logs: ${errorMessage}`);
            return c.json({ errorMessage: 'Failed to get audit logs.' }, 500)
        }
    }

    async getImagesMetada(c: AppContext): Promise<Response> {
        try {
            const imagesReponse = await this.imageService.getImagesMetadata(c);
            return c.json(imagesReponse, 200);
        } catch (error: unknown) {
            const logger = requestLogger(c);
            const errorMessage = parseErrorMessage(error);
            logger.error(`Failed to get images: ${errorMessage}`);
            return c.json({ errorMessage: 'Failed to get images.' }, 500)
        }
    }

    async getImage(c: AppContext): Promise<Response> {
        const match = await caches.default.match(c.req.raw.url);
        if (match) { return match; }
        const id = String(c.req.param('id'));
        try {
            const image = await this.imageService.getImageById(c.env.ANALOGS_BUCKET, c.env.ANALOGS_METADATA_DB, id);
            if (!image) {
                return c.json({ errorMessage: `Image with ${id} not found` }, 404);
            }
            if (!image.description || !image.contentType) {
                return c.json({ errorMessage: `Image with ${id} not found` }, 404);
            }

            const headerName = c.env.ALT_HEADER_NAME;
            const response = new Response(image.file, {
                headers: {
                    'Content-Type': image.contentType,
                    [headerName]: image.description,
                    'Cache-Control': 'public, max-age=31536000, immutable',
                    'ETag': `"${id}-${image.createdAt}"`,
                    'Accept-Ranges': 'bytes'
                },
            });
            try {
                c.executionCtx.waitUntil(
                    caches.default.put(c.req.raw.url, response.clone()).catch((cacheError: unknown) => {
                        console.warn('Failed to cache image:', cacheError);
                    })
                );
            } catch (cacheError) {
                console.warn('Failed to cache image:', cacheError);
            }

            return response;
        } catch (error: unknown) {
            const logger = requestLogger(c);
            const errorMessage = parseErrorMessage(error);
            logger.error(`Failed to get image with ${id}: ${errorMessage}`);
            return c.json({ errorMessage: 'Failed to get image.' }, 500)
        }
    }

    async uploadImage(c: AppContext): Promise<Response> {
        try {
            const formData = await c.req.formData();
            const request = this.mapperService.mapFormDataToImageUploadFileRequest(formData);
            const uploadResponse = await this.imageService.uploadImage(c, request);
            const status = uploadResponse.status ?? (uploadResponse.errorMessage ? 500 : 201);
            return c.json(uploadResponse, status);
        } catch (error: unknown) {
            const logger = requestLogger(c);
            const errorMessage = parseErrorMessage(error);
            logger.error(`Failed to upload image from file: ${errorMessage}`);
            return c.json({ errorMessage: `Failed to upload image from file: ${errorMessage}` }, 500)
        }
    }

    async uploadExternalSourceImage(c: AppContext): Promise<Response> {
        try {
            const formData = await c.req.formData();
            const request = this.mapperService.mapFormDataToImageUploadUrlRequest(formData);
            const uploadResponse = await this.imageService.uploadExternalImage(c, request);
            const status = uploadResponse.status ?? (uploadResponse.errorMessage ? 500 : 201);
            return c.json(uploadResponse, status);
        } catch (error: unknown) {
            const logger = requestLogger(c);
            const errorMessage = parseErrorMessage(error);
            logger.error(`Failed to upload image from external source: ${errorMessage}`);
            return c.json({ errorMessage: 'Failed to upload image from external source.' }, 500)
        }
    }

    async deleteImage(c: AppContext): Promise<Response> {
        const id = String(c.req.param('id'));
        const cacheKey = new Request(c.req.raw.url);
        c.executionCtx.waitUntil(
            caches.default.delete(cacheKey).catch((cacheError: unknown) => {
                console.warn('Failed to invalidate cache:', cacheError);
            })
        );
        try {
            const deletedResponse = await this.imageService.deleteImage(c, id);
            if (deletedResponse.status === 500) { throw Error(`Couldn't delete image.`); }
            return c.json(undefined, deletedResponse.status);
        }
        catch (error: unknown) {
            const logger = requestLogger(c);
            const errorMessage = parseErrorMessage(error);
            logger.error(`Failed to delete image with ${id}: ${errorMessage}`);
            return c.json({ errorMessage: 'Failed to delete image.' }, 500)
        }
    }
}
