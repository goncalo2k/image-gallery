import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function loadEnv() {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const scriptsRoot = resolve(currentDir, "..");
  const envPath = resolve(scriptsRoot, ".env");

  if (!existsSync(envPath)) {
    return;
  }

  const fileContents = readFileSync(envPath, "utf8");

  for (const line of fileContents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const [rawKey, ...rawValue] = trimmed.split("=");
    const key = rawKey?.trim();
    if (!key || process.env[key]) {
      continue;
    }

    const value = rawValue.join("=").trim();
    process.env[key] = value;
  }
}
