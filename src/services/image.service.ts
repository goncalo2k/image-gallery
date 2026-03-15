import type { Context } from "hono";
import type { ImageMapper } from "../utils/image-mapper";

export class ImageService {
    constructor(private mapperService: ImageMapper) { }

    async getImagesMetadata(c: Context): Promise<Image[]> {
        //TODO: Add auth and pagination to this endpoint
        const response = await c.env.ANALOGS_METADATA_DB.prepare('Select * from images').run() as D1Result;
        if (!response.results) {
            throw Error('Failed to fetch all images from D1');
        }

        return response.results as Image[];
    }

    async getImageByName(ANALOGS_BUCKET: R2Bucket, ANALOGS_METADATA_DB: D1Database, name: string): Promise<Partial<Image> | undefined> {
        const object = await ANALOGS_BUCKET.get(name);

        if (!object) {
            return undefined;
        }

        const descriptionResult = await ANALOGS_METADATA_DB.prepare('SELECT description FROM images WHERE name = ? LIMIT 1').bind(name).first();
        const description = descriptionResult?.description as string;
        if (!description) {
            return undefined;
        }

        const contentType = object.httpMetadata?.contentType;
        const file = new File([await object.blob()], name, { type: contentType });
        return { file: file, description, name, contentType } as Partial<Image>;
    }

    async uploadImage(c: Context, body: ImageUploadFileRequest): Promise<boolean> {
        const imageName = body.name ?? body.file.name;
        let isBlobUploaded = false;
        try {
            if (!(body.file instanceof File)) {
                throw Error('No file was uploaded');
            }
            //TODO: Add a cache for this? KV?
            const cachedImage = await this.getImageByName(c.env.ANALOGS_BUCKET, c.env.ANALOGS_METADATA_DB, imageName);
            if (cachedImage) { return false; }
            const fileBuffer = await body.file.arrayBuffer();
            isBlobUploaded = await this.uploadImageBlob(c.env.ANALOGS_BUCKET, imageName, body.file, fileBuffer);
            let finalDescription = body.description;
            //TODO: add metadata cache; add file size limit
            if (!finalDescription) {
                finalDescription = await this.generateImageAltText(c.env.AI, fileBuffer);
            }
            const image = this.mapperService.mapImageMetadataToImage(body, imageName, finalDescription);
            c.executionCtx.waitUntil(
                this.uploadImageMetadata(c.env.ANALOGS_METADATA_DB, image)
                    .then(result => {
                        if (!result) {
                            // Clean up blob if metadata fails
                            if (isBlobUploaded) {
                                this.deleteImageBlob(c.env.ANALOGS_BUCKET, imageName).catch(cleanupError => {
                                    console.error('Cleanup failed:', cleanupError);
                                });
                            }
                        }
                    })
                    .catch(error => {
                        console.error('Background metadata upload failed:', error);
                        if (isBlobUploaded) {
                            this.deleteImageBlob(c.env.ANALOGS_BUCKET, imageName).catch(cleanupError => {
                                console.error('Cleanup failed:', cleanupError);
                            });
                        }
                    })
            );

            return isBlobUploaded && !!finalDescription;
        } catch (error) {
            await this.deleteImageBlob(c.env.ANALOGS_BUCKET, imageName).catch(cleanupError => {
                console.error('Cleanup failed:', cleanupError);
            });
            throw error;
        }
    }

    async uploadExternalImage(c: Context, body: ImageUploadUrlRequest): Promise<boolean> {
        const file = await this.fetchExternalImage(c, body);
        return await this.uploadImage(c, { file, name: body.name, description: body.description } as ImageUploadFileRequest)
    }

    //TODO: Add auth
    async deleteImage(c: Context, name: string): Promise<boolean> {
        const results = await Promise.allSettled([
            this.deleteImageBlob(c.env.ANALOGS_BUCKET, name),
            this.deleteImageMetadata(c.env.ANALOGS_METADATA_DB, name)
        ])

        return results.every(r => r.status === 'fulfilled')
    }

    private async fetchExternalImage(c: Context, request: ImageUploadUrlRequest): Promise<File> {
        let url;
        try {
            url = new URL(request.fileUrl);
        } catch {
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

        const fileName = request.name || crypto.randomUUID();
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

    private async deleteImageMetadata(ANALOGS_METADATA_DB: D1Database, name: string): Promise<void> {
        await ANALOGS_METADATA_DB.prepare("DELETE FROM images WHERE name = ?").bind(name).run();
    }

    //TODO: Add cache for the descriptions and chain the calls to avoid using memory.
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