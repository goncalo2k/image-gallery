import type { ApiResponse } from "./api.model";
import type { ImageAuditLogs } from "./audit-logs";
import type { Image } from "./image";

export type UploadResponse = ApiResponse<Partial<Image>>;

export type ImageAuditLogsResponse = ApiResponse<ImageAuditLogs>;

export type ImageListResponse = ApiResponse<Partial<Image>[]>;

export type DeleteResponse = ApiResponse<never>;