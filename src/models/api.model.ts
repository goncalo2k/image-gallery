import type { ContentfulStatusCode} from "hono/utils/http-status";
import { StatusCode } from "hono/utils/http-status";

export interface ApiResponse<T> {
    data?: T;
    count?: number; //used only in queries where T is a list
    errorMessage?: string;
    status?: ContentfulStatusCode;
}