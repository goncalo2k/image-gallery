/* eslint-disable @typescript-eslint/no-unnecessary-condition */

import type { AppContext } from "../app";
import type { Image } from "../models/image";
import type { ImageUploadFileRequest, ImageUploadUrlRequest } from "../models/image-requests";
import type { DeleteResponse, ImageAuditLogsResponse, ImageListResponse, UploadResponse } from "../models/image-responses";
import type { ImageMapper } from "../utils/image-mapper";
import { bufferToStream, getPaginationParams, isValidImageName, parseErrorMessage } from "../utils/utils";

const BYTES_PER_MB = 1024 * 1024;

export class ImageService {
    constructor(private mapperService: ImageMapper) { }

    async getImagesMetadata(c: AppContext): Promise<ImageListResponse> {
        const { offset, limit } = getPaginationParams(c);

        const countResponse = await c.env.ANALOGS_METADATA_DB.prepare('SELECT COUNT(*) as total FROM images').first();

        const total = Number(countResponse?.total);

        const response = await c.env.ANALOGS_METADATA_DB.prepare(
            'SELECT id, name, description, content_type, size, created_at FROM images ORDER BY created_at DESC LIMIT ? OFFSET ?'
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

        const metadataResult = await ANALOGS_METADATA_DB.prepare('SELECT name, description, size, created_at FROM images WHERE id = ? LIMIT 1').bind(id).first();
        const createdAt = metadataResult?.created_at as string;
        const description = metadataResult?.description as string;
        const name = metadataResult?.name as string;
        const size = Number(metadataResult?.size);
        if (!description || !createdAt) {
            return undefined;
        }

        const contentType = object.httpMetadata?.contentType;
        const file = new File([await object.blob()], name, { type: contentType });
        return { id, file: file, description, name, contentType, createdAt, size: size } as Image;
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

            const cachedImageMetadata = await this.getImageMetadataByName(c.env.ANALOGS_METADATA_DB, imageName);

            if (cachedImageMetadata) {
                return { data: cachedImageMetadata, status: 200 };
            }

            const fileBuffer = await body.file.arrayBuffer();
            const uploadPromise = this.uploadImageBlob(
                c.env.ANALOGS_BUCKET,
                id,
                body.file,
                fileBuffer
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

            const image = this.mapperService.mapImageMetadataToImage(body, imageName, id, finalDescription);
            c.executionCtx.waitUntil(
                this.uploadImageMetadata(c.env.ANALOGS_METADATA_DB, image)
                    .then(async (result) => {
                        if (!result) {
                            // Clean up blob if metadata upload fails
                            if (isBlobUploaded) {
                                this.deleteImageBlob(c.env.ANALOGS_BUCKET, id).catch((cleanupError: unknown) => {
                                    console.error('Cleanup failed:', cleanupError);
                                });
                            }
                            return;
                        }
                        try {
                            await this.updateImageStats(c.env.ANALOGS_METADATA_DB, 1, image.size ?? body.file.size ?? 0);
                        } catch (statsError) {
                            console.error('Failed to update image stats:', statsError);
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
            if (imageName) {
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
            'SELECT id, name, description, content_type, size, created_at FROM images ORDER BY created_at DESC LIMIT ? OFFSET ?'
        ).bind(limit, offset).run();

        const statsPromise = this.getImageStats(c.env.ANALOGS_METADATA_DB);

        const [metadataResult, statsResult] = await Promise.allSettled([metadataPromise, statsPromise]);

        if (metadataResult.status !== 'fulfilled' || !metadataResult.value.results) {
            throw Error("Couldn't list all metadata entries from D1");
        }

        if (statsResult.status !== 'fulfilled') {
            throw Error("Couldn't get total number of images uploaded.");
        }

        const { totalImages, totalSize } = statsResult.value;

        const recentUploads: Partial<Image>[] = metadataResult.value.results.map((row) => this.mapperService.mapRowToPartialImage(row));

        return {
            data: {
                recentUploads,
                statistics: {
                    totalImages,
                    totalSizeBytes: totalSize,
                    lastUpdated: recentUploads.length > 0 ? recentUploads[0].createdAt : undefined
                }
            },
            count: recentUploads.length,
            offset,
            limit,
            total: totalImages
        };
    }

    async deleteImage(c: AppContext, id: string): Promise<DeleteResponse> {
        const existingMetadata = await c.env.ANALOGS_METADATA_DB.prepare('SELECT size FROM images WHERE id = ? LIMIT 1').bind(id).first();
        const size = Number(existingMetadata?.size ?? 0);

        const [blobResult, metadataResult] = await Promise.allSettled([
            this.deleteImageBlob(c.env.ANALOGS_BUCKET, id),
            this.deleteImageMetadata(c.env.ANALOGS_METADATA_DB, id)
        ]);

        const success = blobResult.status === 'fulfilled'
            && metadataResult.status === 'fulfilled'
            && metadataResult.value.meta.changed_db
            && metadataResult.value.success;

        if (success && existingMetadata) {
            await this.updateImageStats(c.env.ANALOGS_METADATA_DB, -1, - (Number.isNaN(size) ? 0 : size));
        }

        return { status: success ? 200 : 500 };
    }

    private async getImageMetadataByName(ANALOGS_METADATA_DB: D1Database, name: string): Promise<Partial<Image> | undefined> {
        if (!isValidImageName(name)) {
            throw new Error("Invalid file name format");
        }

        const descriptionResult = await ANALOGS_METADATA_DB.prepare('SELECT id, description, size, created_at FROM images WHERE name = ? LIMIT 1').bind(name).first();
        const createdAt = descriptionResult?.created_at as string;
        const description = descriptionResult?.description as string;
        const id = descriptionResult?.id as string;
        const size = Number(descriptionResult?.size);
        if (!description || !createdAt) {
            return undefined;
        }

        return { description, name, createdAt, id, size: Number.isNaN(size) ? undefined : size } as Image;
    }

    private async fetchExternalImage(request: ImageUploadUrlRequest): Promise<File> {
        let url;
        try {
            url = new URL(request.fileUrl);
        } catch (error: unknown) {
            if (error instanceof Error) {
                throw Error(`Invalid URL: ${error.message}`);
            }
            throw Error("Couldn't parse URL from body");
        }

        const response = await fetch(url, {
            redirect: 'follow'
        });

        if (!response.ok) {
            throw Error("Couldn't fetch file from remote origin");
        }
        const contentType = response.headers.get('content-type');

        if (!contentType?.includes('image')) {
            throw Error("Remote file's content type is invalid");
        }

        const providedName = request.name;
        const fallbackName = crypto.randomUUID();
        const fileName = providedName ?? fallbackName;
        if (!isValidImageName(fileName)) {
            throw Error('Invalid file name format');
        }
        const blob = await response.blob();

        return new File([blob], fileName, { type: contentType });
    }

    private async uploadImageMetadata(ANALOGS_METADATA_DB: D1Database, image: Image): Promise<boolean> {
        const result = await ANALOGS_METADATA_DB.prepare("INSERT INTO images (id, name, description, content_type, size) VALUES (?, ?, ?, ?, ?)")
            .bind(image.id, image.name, image.description, image.contentType, image.size ?? 0)
            .run();
        if (!result.success || result.meta.rows_written === 0) {
            throw Error('Insert query to D1 failed');
        }
        return true;
    }

    private async uploadImageBlob(ANALOGS_BUCKET: R2Bucket, id: string, file: File, fileBuffer: ArrayBuffer): Promise<boolean> {
        if (!file.type.includes('image')) {
            throw Error("Uploaded file not of type 'image'");
        }

        const object = await ANALOGS_BUCKET.put(id, fileBuffer, {
            httpMetadata: {
                contentType: file.type,
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

    private async ensureStatsRow(ANALOGS_METADATA_DB: D1Database): Promise<void> {
        await ANALOGS_METADATA_DB.prepare("INSERT INTO ImageStats (bucket, total_images, total_size) VALUES ('global', 0, 0) ON CONFLICT(bucket) DO NOTHING").run();
    }

    private async updateImageStats(ANALOGS_METADATA_DB: D1Database, deltaImages: number, deltaSize: number): Promise<void> {
        await this.ensureStatsRow(ANALOGS_METADATA_DB);
        await ANALOGS_METADATA_DB.prepare("UPDATE ImageStats SET total_images = MAX(total_images + ?, 0), total_size = MAX(total_size + ?, 0) WHERE bucket = 'global'")
            .bind(deltaImages, deltaSize)
            .run();
    }

    private async getImageStats(ANALOGS_METADATA_DB: D1Database): Promise<{ totalImages: number; totalSize: number }> {
        await this.ensureStatsRow(ANALOGS_METADATA_DB);
        const statsRow = await ANALOGS_METADATA_DB.prepare("SELECT total_images, total_size FROM ImageStats WHERE bucket = 'global'").first();
        const totalImages = Number(statsRow?.total_images ?? 0);
        const totalSize = Number(statsRow?.total_size ?? 0);
        return {
            totalImages: Number.isNaN(totalImages) ? 0 : totalImages,
            totalSize: Number.isNaN(totalSize) ? 0 : totalSize,
        };
    }
}
