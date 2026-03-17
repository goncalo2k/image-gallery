/* eslint-disable @typescript-eslint/no-unnecessary-condition */

import type { AppContext } from "../app";
import type { Image } from "../models/image";
import type { ImageUploadFileRequest, ImageUploadUrlRequest } from "../models/image-requests";
import type { DeleteResponse, ImageAuditLogsResponse, ImageListResponse, UploadResponse } from "../models/image-responses";
import type { ImageMapper } from "../utils/image-mapper";
import { allowedImageMimeTypesList, bufferToStream, BYTES_PER_MB, getPaginationParams, isAllowedImageContentType, isValidImageName, normalizeContentType, parseErrorMessage, parseHttpUrl } from "../utils/utils";



export class ImageService {
    constructor(private mapperService: ImageMapper) { }

    async getImagesMetadata(c: AppContext): Promise<ImageListResponse> {
        const { offset, limit } = getPaginationParams(c);

        const countResponse = await c.env.ANALOGS_METADATA_DB.prepare('SELECT COUNT(*) as total FROM images').first();

        const total = Number(countResponse?.total);

        const response = await c.env.ANALOGS_METADATA_DB.prepare(
            'SELECT id, name, description, content_type, created_at FROM images ORDER BY created_at DESC LIMIT ? OFFSET ?'
        ).bind(limit, offset).run();

        if (!response.results) {
            throw Error('Failed to fetch images from D1');
        }

        const results: Partial<Image>[] = response.results.map((row) => this.mapperService.mapRowToPartialImage(row));

        return { data: results, count: results.length, offset, limit, total };
    }

    async getImageById(ANALOGS_BUCKET: R2Bucket, ANALOGS_METADATA_DB: D1Database, id: string): Promise<Image | undefined> {
        const object = await ANALOGS_BUCKET.get(id);

        if (!object) {
            return undefined;
        }

        const metadataResult = await ANALOGS_METADATA_DB.prepare('SELECT name, description, created_at FROM images WHERE id = ? LIMIT 1').bind(id).first();
        const createdAt = metadataResult?.created_at as string;
        const description = metadataResult?.description as string;
        const name = metadataResult?.name as string;
        if (!description || !createdAt) {
            return undefined;
        }

        const contentType = object.httpMetadata?.contentType;
        const file = new File([await object.blob()], name, { type: contentType });
        return { id, file: file, description, name, contentType, createdAt } as Image;
    }

    async uploadImage(c: AppContext, body: ImageUploadFileRequest): Promise<UploadResponse> {
        const id = crypto.randomUUID();
        let imageName = '';
        let isBlobUploaded = false;
        try {
            if (!(body.file instanceof File)) {
                return { errorMessage: 'No file was uploaded', status: 400 };
            }

            const maxUploadSizeBytes = c.env.MAX_UPLOAD_SIZE_MB * BYTES_PER_MB;
            if (body.file.size >= maxUploadSizeBytes) {
                const maxSizeMb = Math.max(1, Math.round(maxUploadSizeBytes / (1024 * 1024)));
                return { errorMessage: `The uploaded file is too big - try files under ${maxSizeMb}mb`, status: 400 };
            }

            const preferredName = body.name;
            const fallbackName = body.file.name;
            const imageNameSource = preferredName ?? fallbackName;
            if (!imageNameSource || !isValidImageName(imageNameSource)) {
                return { errorMessage: 'Invalid file name format', status: 400 };
            }
            imageName = imageNameSource.toLowerCase();

            const normalizedContentType = normalizeContentType(body.file.type);
            if (!normalizedContentType || !isAllowedImageContentType(normalizedContentType)) {
                return {
                    errorMessage: `Unsupported image MIME type. Allowed types: ${allowedImageMimeTypesList()}`,
                    status: 400
                };
            }

            const cachedImageMetadata = await this.getImageMetadataByName(c.env.ANALOGS_METADATA_DB, imageName);

            if (cachedImageMetadata) {
                return { data: cachedImageMetadata, status: 200 };
            }

            const fileBuffer = await body.file.arrayBuffer();
            const uploadPromise = this.uploadImageBlob(
                c.env.ANALOGS_BUCKET,
                id,
                fileBuffer,
                normalizedContentType
            );

            const descriptionPromise = body.description
                ? Promise.resolve(body.description)
                : this.generateImageAltText(c.env.AI, c.env.IMAGES, fileBuffer);

            const [uploadResult, descriptionResult] = await Promise.allSettled([
                uploadPromise,
                descriptionPromise,
            ]);

            if (uploadResult.status !== "fulfilled") {
                throw uploadResult.reason;
            }

            if (descriptionResult.status !== "fulfilled") {
                throw descriptionResult.reason;
            }

            isBlobUploaded = uploadResult.value;
            const finalDescription = descriptionResult.value;

            const image = {
                ...this.mapperService.mapImageMetadataToImage(body, imageName, id, finalDescription),
                contentType: normalizedContentType
            };
            c.executionCtx.waitUntil(
                this.uploadImageMetadata(c.env.ANALOGS_METADATA_DB, image)
                    .then(result => {
                        if (!result) {
                            // Clean up blob if metadata upload fails
                            if (isBlobUploaded) {
                                this.deleteImageBlob(c.env.ANALOGS_BUCKET, id).catch((cleanupError: unknown) => {
                                    console.error('Cleanup failed:', cleanupError);
                                });
                            }
                        }
                    })
                    .catch((error: unknown) => {
                        console.error('Background metadata upload failed:', error);
                        if (isBlobUploaded) {
                            this.deleteImageBlob(c.env.ANALOGS_BUCKET, id).catch((cleanupError: unknown) => {
                                console.error('Cleanup failed:', cleanupError);
                            });
                        }
                    })
            );

            return { data: this.mapperService.mapImageToPartialImage(image), status: 202 };
        } catch (error: unknown) {
            if (isBlobUploaded) {
                await this.deleteImageBlob(c.env.ANALOGS_BUCKET, id).catch((cleanupError: unknown) => {
                    console.error('Cleanup failed:', cleanupError);
                });
            }
            throw error;
        }
    }

    async uploadExternalImage(c: AppContext, body: ImageUploadUrlRequest): Promise<UploadResponse> {
        try {
            const file = await this.fetchExternalImage(body);
            return await this.uploadImage(c, this.mapperService.mapImageUploadUrlRequestToImageUploadFileRequest(body, file));
        } catch (error: unknown) {
            return { errorMessage: parseErrorMessage(error), status: 400 };
        }
    }

    async getImagesAuditLogs(c: AppContext): Promise<ImageAuditLogsResponse> {
        const { offset, limit } = getPaginationParams(c);

        const metadataPromise = c.env.ANALOGS_METADATA_DB.prepare(
            'SELECT id, name, description, content_type, created_at FROM images ORDER BY created_at DESC LIMIT ? OFFSET ?'
        ).bind(limit, offset).run();

        const countPromise = c.env.ANALOGS_METADATA_DB.prepare(
            'SELECT COUNT(*) as total FROM images'
        ).first();

        const [metadataResult, countResult] = await Promise.allSettled([metadataPromise, countPromise]);

        if (countResult.status !== 'fulfilled') {
            throw Error("Couldn't get number of images stored in D1");
        }

        if (metadataResult.status !== 'fulfilled' || !metadataResult.value.results) {
            throw Error("Couldn't list all metadata entries from D1");
        }

        if (!countResult.value) {
            throw Error("Couldn't get total number of images uploaded.");
        }

        const total = Number(countResult.value?.total);

        const recentUploads: Partial<Image>[] = metadataResult.value.results.map((row) => this.mapperService.mapRowToPartialImage(row));

        return {
            data: {
                recentUploads,
                statistics: {
                    totalImages: total,
                    lastUpdated: recentUploads.length > 0 ? recentUploads[0].createdAt : undefined
                }
            },
            count: recentUploads.length,
            offset,
            limit,
            total
        };
    }

    async deleteImage(c: AppContext, id: string): Promise<DeleteResponse> {
        const [blobResult, metadataResult] = await Promise.allSettled([
            this.deleteImageBlob(c.env.ANALOGS_BUCKET, id),
            this.deleteImageMetadata(c.env.ANALOGS_METADATA_DB, id)
        ]);

        if (metadataResult.status !== 'fulfilled' || !metadataResult.value.success) {
            return { status: 500 };
        }

        if (!metadataResult.value.meta.changed_db || metadataResult.value.meta.changes === 0) {
            return { status: 404, errorMessage: `Image with id ${id} was not found` };
        }

        if (blobResult.status !== 'fulfilled') {
            return { status: 500 };
        }

        return { status: 200 };
    }

    private async getImageMetadataByName(ANALOGS_METADATA_DB: D1Database, name: string): Promise<Partial<Image> | undefined> {
        if (!isValidImageName(name)) {
            throw new Error("Invalid file name format");
        }

        const descriptionResult = await ANALOGS_METADATA_DB.prepare('SELECT id, description, created_at, content_type FROM images WHERE name = ? LIMIT 1').bind(name).first();
        const createdAt = descriptionResult?.created_at as string;
        const description = descriptionResult?.description as string;
        const id = descriptionResult?.id as string;
        const contentType = descriptionResult?.content_type as string;
        if (!description || !createdAt || !id || !contentType) {
            return undefined;
        }

        return { description, name, contentType, createdAt, id } as Image;
    }

    private async fetchExternalImage(request: ImageUploadUrlRequest): Promise<File> {
        const url = parseHttpUrl(request.fileUrl);

        const response = await fetch(url, {
            redirect: 'follow'
        });

        if (!response.ok) {
            throw Error("Couldn't fetch file from remote origin");
        }
        const normalizedContentType = normalizeContentType(response.headers.get('content-type'));

        if (!normalizedContentType || !isAllowedImageContentType(normalizedContentType)) {
            throw Error(`Remote file's content type is invalid. Allowed types: ${allowedImageMimeTypesList()}`);
        }

        const providedName = request.name;
        const fallbackName = crypto.randomUUID();
        const fileName = providedName ?? fallbackName;
        if (!isValidImageName(fileName)) {
            throw Error('Invalid file name format');
        }
        const blob = await response.blob();

        return new File([blob], fileName, { type: normalizedContentType });
    }

    private async uploadImageMetadata(ANALOGS_METADATA_DB: D1Database, image: Image): Promise<boolean> {
        const result = await ANALOGS_METADATA_DB.prepare("INSERT INTO images (id, name, description, content_type) VALUES (?, ?, ?, ?)")
            .bind(image.id, image.name, image.description, image.contentType)
            .run();
        if (!result.success || result.meta.rows_written === 0) {
            throw Error('Insert query to D1 failed');
        }
        return true;
    }

    private async uploadImageBlob(ANALOGS_BUCKET: R2Bucket, id: string, fileBuffer: ArrayBuffer, contentType: string): Promise<boolean> {
        if (!isAllowedImageContentType(contentType)) {
            throw Error(`Uploaded file not of an allowed image type. Allowed types: ${allowedImageMimeTypesList()}`);
        }

        const object = await ANALOGS_BUCKET.put(id, fileBuffer, {
            httpMetadata: {
                contentType,
            },
        });

        if (object === null) {
            throw Error('R2 upload returned null');
        }

        return true;
    }

    private async deleteImageMetadata(ANALOGS_METADATA_DB: D1Database, id: string): Promise<D1Result> {
        return await ANALOGS_METADATA_DB.prepare("DELETE FROM images WHERE id = ?").bind(id).run();
    }

    private async deleteImageBlob(ANALOGS_BUCKET: R2Bucket, id: string): Promise<void> {
        await ANALOGS_BUCKET.delete(id);
    }

    private async generateImageAltText(AI_WORKER: Ai, IMAGES: ImagesBinding, fileBuffer: ArrayBuffer): Promise<string> {
        const resizedBuffer = await this.resizeImageForAI(IMAGES, fileBuffer);

        const input = {
            image: [...new Uint8Array(resizedBuffer)],
            prompt: "Generate a caption for this image",
            max_tokens: 256,
        };

        const response = await AI_WORKER.run(
            "@cf/llava-hf/llava-1.5-7b-hf",
            input
        );

        const description = (response as { description?: string })?.description
            ?? (response as { response?: string })?.response;
        if (!description) {
            throw Error("Image generation didn't return a valid value");
        }

        return description;
    }

    private async resizeImageForAI(IMAGES: ImagesBinding, fileBuffer: ArrayBuffer): Promise<ArrayBuffer> {
        if (fileBuffer.byteLength <= BYTES_PER_MB) {
            return fileBuffer;
        }

        try {
            const stream = bufferToStream(fileBuffer);
            const resized = await IMAGES
                .input(stream)
                .transform({ width: 1024, height: 1024, fit: "scale-down" })
                .output({ format: "image/jpeg", quality: 80 });

            return await resized.response().arrayBuffer();
        } catch (error) {
            console.warn('Image resizing for AI failed, falling back to original buffer', error);
            return fileBuffer;
        }
    }
}
