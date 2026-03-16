const IMAGE_NAME_REGEX = /^[a-z0-9 _-]+(\.[a-z]+)?$/i;

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