import type { ContentfulStatusCode} from "hono/utils/http-status";

export interface ApiResponse<T> {
    data?: T;
    count?: number; //used only when T is a list
    errorMessage?: string;
    status?: ContentfulStatusCode;
}