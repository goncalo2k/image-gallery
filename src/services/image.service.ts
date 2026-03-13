import { Context } from "hono";
import { ImageMapper } from "./image-mapper";

export class ImageService {
    constructor(private mapperService: ImageMapper) { }

    async getImages(): Promise<Image[]> {
        return [];
    }

    async getImageByName(ANALOGS_BUCKET: R2Bucket, ANALOGS_METADATA_DB: D1Database, id: string): Promise<Partial<Image> | undefined> {
        try {
            const object = await ANALOGS_BUCKET.get(id);

            if (!object) {
                return undefined;
            }

            const descriptionResult = await ANALOGS_METADATA_DB.prepare('SELECT description FROM images WHERE id = ? LIMIT 1').bind(id).first();
            const description = descriptionResult?.description as string;
            if (!description) {
                return undefined;
            }

            return { blob: object.body, description } as Partial<Image>;
        } catch (error) {
            console.error('Fetch from R2 failed:', error);
            throw Error('Upload to R2 failed');
        }
    }

    async uploadImage(c: Context, body: ImageUploadRequest): Promise<boolean> {
        const imageId = crypto.randomUUID();
        let isMetadataUploaded = false;
        let isBlobUploaded = false;
        try {
            if (!(body.file instanceof File)) {
                throw Error('No file was uploaded');
            }

            const fileBuffer = await body.file.arrayBuffer();
            isBlobUploaded = await this.uploadImageBlob(c.env.ANALOGS_BUCKET, imageId, body.file, fileBuffer);
            let finalDescription = body.description;
            if (!finalDescription) {
                finalDescription = await this.generateImageAltText(c.env.AI, fileBuffer);
            }
            const image = this.mapperService.mapImageMetadataToImage(body, imageId, finalDescription);

            isMetadataUploaded = await this.uploadImageMetadata(c.env.ANALOGS_METADATA_DB, image);
            return isMetadataUploaded && isBlobUploaded && !!finalDescription;
        } catch (error) {
            if (isBlobUploaded) await this.deleteImageBlob(c.env.ANALOGS_BUCKET, imageId);
            if (isMetadataUploaded) await this.deleteImageMetadata(c.env.ANALOGS_METADATA_DB, imageId);
            console.error('Failed to upload image:', error);
            throw Error('Failed to upload image');
        }
    }

    private async uploadImageMetadata(ANALOGS_METADATA_DB: D1Database, image: Image): Promise<boolean> {
        try {
            const result = await ANALOGS_METADATA_DB.prepare("INSERT INTO images (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
                .bind(image.id, image.name, image.description, image.createdAt, image.updatedAt)
                .run() as D1Result;
            if (!result.success || result.meta.rows_written === 0) {
                throw Error('Insert query to D1 failed');
            }
            return true;
        } catch (error) {
            throw error;
        }
    }

    private async deleteImageMetadata(ANALOGS_METADATA_DB: D1Database, id: string): Promise<void> {
        try {
            await ANALOGS_METADATA_DB.prepare("DELETE FROM images WHERE id = ?").bind(id).run();
        }
        catch (error) {
            throw error;
        }
    }

    private async uploadImageBlob(ANALOGS_BUCKET: R2Bucket, id: string, file: File, fileBuffer: ArrayBuffer): Promise<boolean> {
        try {
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
        } catch (error) {
            throw error;
        }
    }

    private async deleteImageBlob(ANALOGS_BUCKET: R2Bucket, id: string): Promise<void> {
        try {
            await ANALOGS_BUCKET.delete(id);
        }
        catch (error) {
            throw error;
        }
    }

    private async generateImageAltText(AI_WORKER: Ai, fileBuffer: ArrayBuffer): Promise<string> {
        try {
            const input = {
                image: [...new Uint8Array(fileBuffer)],
                prompt: "Generate a caption for this image",
                max_tokens: 512,
            };

            const response = await AI_WORKER.run(
                "@cf/llava-hf/llava-1.5-7b-hf",
                input
            );

            if (!response) {
                throw Error("Image generation didn't return a valid value");
            }

            return JSON.stringify(response);
        } catch (error) {
            throw error;
        }
    }
}