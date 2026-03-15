/* eslint-disable @typescript-eslint/no-unnecessary-condition */

import type { AppContext } from "../app";
import type { ImageAuditLogs } from "../models/audit-logs";
import type { Image } from "../models/image";
import type { ImageUploadFileRequest, ImageUploadUrlRequest } from "../models/image-requests";
import type { DeleteResponse, ImageAuditLogsResponse, ImageListResponse, UploadResponse } from "../models/image-responses";
import type { ImageMapper } from "../utils/image-mapper";

export class ImageService {
    constructor(private mapperService: ImageMapper) { }

    async getImagesMetadata(c: AppContext): Promise<ImageListResponse> {
        //TODO: Add pagination to this endpoint
        const pageSize = 50;
        const response = await c.env.ANALOGS_METADATA_DB.prepare('Select * from images LIMIT ?').bind(pageSize).run();
        if (!response.results) {
            throw Error('Failed to fetch all images from D1');
        }

        const results: Partial<Image>[] = response.results.map((row) => ({
            name: String(row.name),
            description: String(row.description),
            contentType: String(row.contentType),
            // add any other Image fields here
        }));

        return { data: results, count: response.results.length };
    }

    async getImageByName(ANALOGS_BUCKET: R2Bucket, ANALOGS_METADATA_DB: D1Database, name: string): Promise<Image | undefined> {
        const object = await ANALOGS_BUCKET.get(name);

        if (!object) {
            return undefined;
        }

        const descriptionResult = await ANALOGS_METADATA_DB.prepare('SELECT description, created_at FROM images WHERE name = ? LIMIT 1').bind(name).first();
        const createdAt = descriptionResult?.created_at as string;
        const description = descriptionResult?.description as string;
        if (!description || !createdAt) {
            return undefined;
        }

        const contentType = object.httpMetadata?.contentType;
        const file = new File([await object.blob()], name, { type: contentType });
        return { file: file, description, name, contentType, createdAt } as Image;
    }

    async uploadImage(c: AppContext, body: ImageUploadFileRequest): Promise<UploadResponse> {
        const imageName = body.name ?? body.file.name;
        let isBlobUploaded = false;
        try {
            if (!(body.file instanceof File)) {
                throw Error('No file was uploaded');
            }

            if (body.file.size >= 5 * 1024 * 1024) {
                throw Error('The uploaded file is too big - try files under 5mb');
            }

            //TODO: Add a cache for this? KV?
            const cachedImage = await this.getImageByName(c.env.ANALOGS_BUCKET, c.env.ANALOGS_METADATA_DB, imageName);
            if (cachedImage) {
                return { data: this.mapperService.mapImageToPartialImage(cachedImage), status: 302 };
            }
            const fileBuffer = await body.file.arrayBuffer();
            const uploadPromise = this.uploadImageBlob(
                c.env.ANALOGS_BUCKET,
                imageName,
                body.file,
                fileBuffer
            );

            const descriptionPromise = body.description
                ? Promise.resolve(body.description)
                : this.generateImageAltText(c.env.AI, fileBuffer);

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

            const image = this.mapperService.mapImageMetadataToImage(body, imageName, finalDescription);
            c.executionCtx.waitUntil(
                this.uploadImageMetadata(c.env.ANALOGS_METADATA_DB, image)
                    .then(result => {
                        if (!result) {
                            // Clean up blob if metadata upload fails
                            if (isBlobUploaded) {
                                this.deleteImageBlob(c.env.ANALOGS_BUCKET, imageName).catch((cleanupError: unknown) => {
                                    console.error('Cleanup failed:', cleanupError);
                                });
                            }
                        }
                    })
                    .catch((error: unknown) => {
                        console.error('Background metadata upload failed:', error);
                        if (isBlobUploaded) {
                            this.deleteImageBlob(c.env.ANALOGS_BUCKET, imageName).catch((cleanupError: unknown) => {
                                console.error('Cleanup failed:', cleanupError);
                            });
                        }
                    })
            );

            return { data: this.mapperService.mapImageToPartialImage(image) };
        } catch (error: unknown) {
            await this.deleteImageBlob(c.env.ANALOGS_BUCKET, imageName).catch((cleanupError: unknown) => {
                console.error('Cleanup failed:', cleanupError);
            });
            throw error;
        }
    }

    async uploadExternalImage(c: AppContext, body: ImageUploadUrlRequest): Promise<UploadResponse> {
        const file = await this.fetchExternalImage(body);
        return await this.uploadImage(c, this.mapperService.mapImageUploadUrlRequestToImageUploadFileRequest(body, file));
    }

    async getImagesAuditLogs(c: AppContext): Promise<ImageAuditLogsResponse> {
        const metadataPromise = c.env.ANALOGS_METADATA_DB.prepare(
            'SELECT name, description, content_type, created_at FROM images ORDER BY created_at DESC'
        ).all();

        const imagesPromise = c.env.ANALOGS_BUCKET.list();

        const [metadataResult, imagesResult] = await Promise.allSettled([metadataPromise, imagesPromise])

        let r2Count = 0;
        let totalSize = 0;

        if (imagesResult.status !== 'fulfilled') {
            throw Error("Couldn't list all images from R2");
        }

        if (metadataResult.status !== 'fulfilled') {
            throw Error("Couldn't list all metadata entries from D1");
        }


        for (const object of imagesResult.value.objects) {
            r2Count++;
            totalSize += object.size;
        }

        return {
            data: {
                images: metadataResult.value.results,
                statistics: {
                    totalImages: metadataResult.value.results.length,
                    totalObjectsInR2: r2Count,
                    totalStorageBytes: totalSize,
                    lastUpdated: new Date().toISOString()
                }
            } as ImageAuditLogs
        } as ImageAuditLogsResponse;
    }

    //TODO: Add auth
    async deleteImage(c: AppContext, name: string): Promise<DeleteResponse> {
        const [blobResult, metadataResult] = await Promise.allSettled([
            this.deleteImageBlob(c.env.ANALOGS_BUCKET, name),
            this.deleteImageMetadata(c.env.ANALOGS_METADATA_DB, name)
        ])

        return { status: blobResult.status === 'fulfilled' && metadataResult.status === 'fulfilled' && metadataResult.value.meta.changed_db && metadataResult.value.success ? 200 : 500 }
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

        const fileName = request.name ?? crypto.randomUUID();
        const blob = await response.blob();

        return new File([blob], fileName, { type: contentType });
    }

    private async uploadImageMetadata(ANALOGS_METADATA_DB: D1Database, image: Image): Promise<boolean> {
        const result = await ANALOGS_METADATA_DB.prepare("INSERT INTO images (name, description, content_type) VALUES (?, ?, ?)")
            .bind(image.name, image.description, image.contentType)
            .run();
        if (!result.success || result.meta.rows_written === 0) {
            throw Error('Insert query to D1 failed');
        }
        return true;
    }

    private async uploadImageBlob(ANALOGS_BUCKET: R2Bucket, name: string, file: File, fileBuffer: ArrayBuffer): Promise<boolean> {
        if (!file.type.includes('image')) {
            throw Error("Uploaded file not of type 'image'");
        }

        const object = await ANALOGS_BUCKET.put(name, fileBuffer, {
            httpMetadata: {
                contentType: file.type,
            },
        });

        if (object === null) {
            throw Error('R2 upload returned null');
        }

        return true;
    }

    private async deleteImageMetadata(ANALOGS_METADATA_DB: D1Database, name: string): Promise<D1Result> {
        return await ANALOGS_METADATA_DB.prepare("DELETE FROM images WHERE name = ?").bind(name).run();
    }

    private async deleteImageBlob(ANALOGS_BUCKET: R2Bucket, name: string): Promise<void> {
        await ANALOGS_BUCKET.delete(name);
    }

    private async generateImageAltText(AI_WORKER: Ai, fileBuffer: ArrayBuffer): Promise<string> {
        const input = {
            image: [...new Uint8Array(fileBuffer)],
            prompt: "Generate a caption for this image",
            max_tokens: 256,
        };

        const response = await AI_WORKER.run(
            "@cf/llava-hf/llava-1.5-7b-hf",
            input
        );

        if (!response) {
            throw Error("Image generation didn't return a valid value");
        }

        return response.description;
    }
}