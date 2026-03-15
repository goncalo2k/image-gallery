export function parseCsv(value: string): string[] {
    return value
        .split(',')
        .map(v => v.trim())
        .filter(Boolean);
}