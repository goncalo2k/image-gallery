export class ImageMapper {
    mapImageMetadataToImage(imageRequest: ImageUploadRequest, imageId: string, imageDescription: string): Image {
        return {
            id: imageId,
            name: imageRequest.name ?? imageRequest.file.name,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            description: imageDescription,
            contentType: imageRequest.file.type,
            file: imageRequest.file,
        } as Image;
    }
}