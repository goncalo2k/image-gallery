import type { AppContext } from "../app";

const IMAGE_NAME_REGEX = /^[a-z0-9 _-]+(\.[a-z]+)?$/i;

export const BYTES_PER_MB = 1024 * 1024;
export const ALLOWED_IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml', 'image/avif'] as const;
export const ALLOWED_IMAGE_MIME_SET = new Set<string>(ALLOWED_IMAGE_MIME_TYPES);
const ALLOWED_HTTP_PROTOCOLS = new Set(['https:']);

export function parseCsv(value: string): string[] {
    return value
        .split(',')
        .map(v => v.trim())
        .filter(Boolean);
}

export function isValidImageName(name: string | undefined | null): boolean {
    if (!name) {
        return false;
    }
    return IMAGE_NAME_REGEX.test(name);
}

export function parseErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export function bufferToStream(buffer: ArrayBuffer): ReadableStream<Uint8Array> {
    const stream = new Response(buffer).body;
    if (!stream) {
        throw Error('Unable to convert buffer to stream');
    }
    return stream as ReadableStream<Uint8Array>;
}

export function getPaginationParams(c: AppContext, defaultLimit = 20, maxLimit = 100): { offset: number, limit: number } {
    const offsetParam = Number.parseInt(c.req.query('offset') ?? '0', 10);
    const limitParam = Number.parseInt(c.req.query('limit') ?? String(defaultLimit), 10);

    const offset = Number.isNaN(offsetParam) || offsetParam < 0 ? 0 : offsetParam;
    const sanitizedLimit = Number.isNaN(limitParam) || limitParam <= 0 ? defaultLimit : limitParam;
    const limit = Math.min(sanitizedLimit, maxLimit);

    return { offset, limit };
}

export function normalizeContentType(contentType: string | null | undefined): string | undefined {
    if (!contentType) {
        return undefined;
    }

    const [type] = contentType.split(';');
    return type.trim().toLowerCase();
}

export function isAllowedImageContentType(contentType: string | null | undefined): contentType is string {
    if (!contentType) {
        return false;
    }

    return ALLOWED_IMAGE_MIME_SET.has(contentType.toLowerCase());
}

export function allowedImageMimeTypesList(): string {
    return ALLOWED_IMAGE_MIME_TYPES.join(', ');
}

export function parseHttpUrl(rawUrl: string): URL {
    if (!rawUrl) {
        throw Error('URL is required');
    }

    let parsedUrl: URL;
    try {
        parsedUrl = new URL(rawUrl);
    } catch (error) {
        if (error instanceof Error) {
            throw Error(`Invalid URL: ${error.message}`);
        }
        throw Error("Couldn't parse URL");
    }

    if (!ALLOWED_HTTP_PROTOCOLS.has(parsedUrl.protocol)) {
        throw Error('URL protocol must be http or https');
    }

    if (!parsedUrl.hostname) {
        throw Error('URL must include a hostname');
    }

    return parsedUrl;
}
