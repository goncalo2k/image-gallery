import { Context } from "hono";

export class ImageService {

    async getImages(): Promise<Image[]> {
        return [];
    }

    async getImageByName(c: Context, name: string): Promise<Image | undefined> {
        const key = `analogs/${name}`;

        const object = await c.env.ANALOGS_BUCKET.get(key);

        if (!object) {
            return undefined;
        }

        const headerName = c.env.ALT_HEADER_NAME;
        const imageMetadata = c.env.ANALOGS_METADATA_DB.get();
        //TODO: Add d1 metadata
        const description = '';
        const contentType = object.httpMetadata?.contentType;
        return { blob: object.body, description, contentType } as Image;
    }

    async uploadImage(image: Image): Promise<boolean> {
        return true;
    }
}