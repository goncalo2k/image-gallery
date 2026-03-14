export class ImageMapper {

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

    mapImageMetadataToImage(imageRequest: ImageUploadFileRequest, imageName: string, imageDescription: string): Image {
        return {
            name: imageName,
            description: imageDescription,
            contentType: imageRequest.file.type,
            file: imageRequest.file,
        } as Image;
    }
}