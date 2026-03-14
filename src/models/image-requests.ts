interface ImageUploadFileRequest {
    file: File;
    name?: string;
    description?: string;
}

interface ImageUploadUrlRequest {
    fileUrl: string;
    name?: string;
    description?: string;
}