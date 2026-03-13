export class ImageMapper {
    mapImageMetadataToImage(imageRequest: ImageUploadRequest, imageName: string, imageDescription: string): Image {
        return {
            name: imageName,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            description: imageDescription,
            contentType: imageRequest.file.type,
            file: imageRequest.file,
        } as Image;
    }
}