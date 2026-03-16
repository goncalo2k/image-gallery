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
