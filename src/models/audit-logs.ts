import type { Image } from "./image";

export interface ImageAuditLogs {
    recentUploads: Partial<Image>[];
    statistics: Statistics;
};

export interface Statistics {
    totalImages: number;
    lastUpdated: string;
}
