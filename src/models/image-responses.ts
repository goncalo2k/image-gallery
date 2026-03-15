import type { ApiResponse } from "./api.model";
import type { ImageAuditLogs } from "./audit-logs";

export type UploadResponse = ApiResponse<Partial<Image>>;

export type ImageAuditLogsResponse = ApiResponse<ImageAuditLogs>;

export type ImageListResponse = ApiResponse<Image[]>;

export type DeleteResponse = ApiResponse<never>;        