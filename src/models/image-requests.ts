export interface ImageUploadFileRequest {
    file: File;
    name?: string;
    description?: string;
}

export interface ImageUploadUrlRequest {
    fileUrl: string;
    name?: string;
    description?: string;
}