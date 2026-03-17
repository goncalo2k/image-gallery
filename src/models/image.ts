export interface Image {
    id?: string;
    name: string;
    createdAt?: string;
    description: string;
    contentType: string;
    size: number;
    file: File;
}
