#!/usr/bin/env node
/* eslint-disable @typescript-eslint/await-thenable */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

loadDevVars();

const API_BASE = process.env.API_BASE ?? "http://localhost:8787";
const FILE_URL = "https://picsum.photos/200/300";
const CLIENT_ID_HEADER = process.env.CLIENT_ID_HEADER;
const CLIENT_SECRET_HEADER = process.env.CLIENT_SECRET_HEADER;
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const TOTAL_UPLOADS = Number.parseInt(process.env.TOTAL_UPLOADS ?? "50", 10);

function loadDevVars() {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const projectRoot = resolve(scriptDir, "..");
  const devVarsPath = resolve(projectRoot, ".dev.vars");

  if (!existsSync(devVarsPath)) {
    return;
  }

  const fileContents = readFileSync(devVarsPath, "utf8");
  for (const line of fileContents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const [rawKey, ...rest] = trimmed.split("=");
    const key = rawKey?.trim();
    if (!key || process.env[key]) {
      continue;
    }
    const value = rest.join("=").trim();
    process.env[key] = value;
  }
}

function buildAuthHeaders() {
  if (!CLIENT_ID_HEADER || !CLIENT_SECRET_HEADER || !CLIENT_ID || !CLIENT_SECRET) {
    return {};
  }

  return {
    [CLIENT_ID_HEADER]: CLIENT_ID,
    [CLIENT_SECRET_HEADER]: CLIENT_SECRET,
  };
}

async function upload(index) {
  const form = new FormData();
  form.set("fileUrl", FILE_URL);
  form.set("name", `picsum-${Date.now()}-${index}.jpg`);
  form.set("description", `Picsum placeholder #${index + 1}`);

  const response = await fetch(`${API_BASE}/images/external`, {
    method: "POST",
    body: form,
    headers: buildAuthHeaders(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Request ${index + 1} failed: ${response.status} ${errorBody}`);
  }

  const payload = await response.json();
  console.log(`Uploaded #${index + 1}`, payload);
}

async function main() {
  for (let i = 0; i < TOTAL_UPLOADS; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await upload(i);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
