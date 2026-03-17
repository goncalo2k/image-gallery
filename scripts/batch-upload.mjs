#!/usr/bin/env node
/* eslint-disable @typescript-eslint/await-thenable */
import { performance } from "node:perf_hooks";
import { loadEnv } from "./utils/load-env.mjs";

loadEnv();

const API_BASE = process.env.API_BASE ?? "http://localhost:8787";
const FILE_URL = process.env.FILE_URL ?? "https://picsum.photos/800/800";
const CLIENT_ID_HEADER = process.env.CLIENT_ID_HEADER;
const CLIENT_SECRET_HEADER = process.env.CLIENT_SECRET_HEADER;
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const TOTAL_UPLOADS = Number.parseInt(process.env.TOTAL_UPLOADS ?? "50", 10);
const CONCURRENCY = Math.max(1, Number.parseInt(process.env.CONCURRENCY ?? "5", 10));
const DELAY_MS = Math.max(0, Number.parseInt(process.env.DELAY_MS ?? "0", 10));

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
  const uploadedId = payload?.data?.id ?? payload?.data?.name ?? 'unknown';
  console.log(`Uploaded #${index + 1} (id=${uploadedId})`);
}

async function worker(queue, stats) {
  while (queue.length > 0) {
    const nextIndex = queue.shift();
    if (typeof nextIndex !== "number") {
      break;
    }

    // eslint-disable-next-line no-await-in-loop
    await upload(nextIndex)
      .then(() => {
        stats.success += 1;
      })
      .catch((error) => {
        stats.failures.push({ index: nextIndex + 1, error });
      });

    if (DELAY_MS > 0) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
    }
  }
}

async function main() {
  const queue = Array.from({ length: TOTAL_UPLOADS }, (_, index) => index);
  const stats = { success: 0, failures: [] };
  const start = performance.now();
  const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, () => worker(queue, stats));

  await Promise.all(workers);

  const durationSeconds = ((performance.now() - start) / 1000).toFixed(2);
  console.log(`Finished in ${durationSeconds}s → ${stats.success}/${TOTAL_UPLOADS} uploads succeeded.`);

  if (stats.failures.length > 0) {
    const lines = stats.failures.map((failure) => `#${failure.index}: ${failure.error?.message ?? failure.error}`);
    throw new Error(`Some uploads failed:\n${lines.join("\n")}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
