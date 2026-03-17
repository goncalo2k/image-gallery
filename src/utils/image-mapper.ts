import type { Image } from "../models/image";
import type { ImageUploadFileRequest, ImageUploadUrlRequest } from "../models/image-requests";

export class ImageMapper {

    mapRowToPartialImage(row: Record<string, unknown>): Partial<Image> {
        return {
            id: row.id,
            name: row.name,
            description: row.description,
            contentType: row.content_typ,
            createdAt: row.created_at,
        } as Partial<Image>
    }
    mapFormDataToImageUploadFileRequest(formData: FormData): ImageUploadFileRequest {
        return {
            name: formData.get('name'),
            file: formData.get('file'),
            description: formData.get('description')
        } as ImageUploadFileRequest;
    }

    mapFormDataToImageUploadUrlRequest(formData: FormData): ImageUploadUrlRequest {
        return {
            name: formData.get('name'),
            fileUrl: formData.get('fileUrl'),
            description: formData.get('description')
        } as ImageUploadUrlRequest;
    }

    mapImageUploadUrlRequestToImageUploadFileRequest(request: ImageUploadUrlRequest, file: File): ImageUploadFileRequest {
        return { file, name: request.name ? request.name.toLowerCase() : undefined, description: request.description };
    }

    mapImageMetadataToImage(imageRequest: ImageUploadFileRequest, imageName: string, id: string, imageDescription: string): Image {
        return {
            id,
            name: imageName,
            description: imageDescription,
            contentType: imageRequest.file.type,
            file: imageRequest.file,
        } as Image;
    }

    mapImageToPartialImage(image: Image): Partial<Image> {
        return {
            id: image.id, name: image.name, description: image.description, contentType: image.contentType, createdAt: image.createdAt
        } as Partial<Image>;
    }
}
