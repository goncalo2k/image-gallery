export interface ImageAuditLogs {
    images: Image[];
    statistics: Statistics;
};

export interface Statistics {
    totalImages: number;
    totalObjectsInR2: number;
    totalStorageBytes: number;
    lastUpdated: string;
}