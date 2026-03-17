#!/usr/bin/env node
import { performance } from "node:perf_hooks";
import { loadEnv } from "./utils/load-env.mjs";

loadEnv();

const API_BASE = process.env.API_BASE ?? "http://localhost:8787";
const CLIENT_ID_HEADER = process.env.CLIENT_ID_HEADER;
const CLIENT_SECRET_HEADER = process.env.CLIENT_SECRET_HEADER;
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const PAGE_SIZE = Number.parseInt(process.env.PAGE_SIZE ?? "100", 10);
const DRY_RUN = process.env.DRY_RUN === "true";
const MAX_BATCHES = Math.max(0, Number.parseInt(process.env.MAX_BATCHES ?? "0", 10));

function buildAuthHeaders() {
  const headers = {
    Accept: "application/json",
  };

  if (CLIENT_ID_HEADER && CLIENT_SECRET_HEADER && CLIENT_ID && CLIENT_SECRET) {
    headers[CLIENT_ID_HEADER] = CLIENT_ID;
    headers[CLIENT_SECRET_HEADER] = CLIENT_SECRET;
  }

  return headers;
}

async function fetchBatch() {
  const url = new URL("/images", API_BASE);
  url.searchParams.set("offset", "0");
  url.searchParams.set("limit", PAGE_SIZE.toString());

  const response = await fetch(url, {
    method: "GET",
    headers: buildAuthHeaders(),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to list images: ${response.status} ${body}`);
  }

  return response.json();
}

function createIdentifier(image) {
  const id = typeof image?.id === "string" ? image.id : undefined;
  const name = typeof image?.name === "string" ? image.name : undefined;
  return { id, name };
}

async function deleteImage(image) {
  const { id, name } = createIdentifier(image);

  if (!id) {
    console.warn(`  ⚠︎ skipping entry without id (name=${name ?? 'unknown'})`);
    return { skipped: true };
  }

  if (DRY_RUN) {
    console.log(`  ☐ dry-run: would remove id=${id}${name ? ` (${name})` : ""}`);
    return { success: true };
  }

  const encoded = encodeURIComponent(id);
  const response = await fetch(`${API_BASE}/images/${encoded}`, {
    method: "DELETE",
    headers: buildAuthHeaders(),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Failed to delete id=${id}: ${response.status} ${errorBody}`);
  }

  return { success: true };
}

async function clearAllImages() {
  let totalDeleted = 0;
  let totalDiscovered = 0;
  let attempts = 0;
  const failures = [];
  const start = performance.now();
  let skipped = 0;

  while (true) {
    attempts += 1;
    const batch = await fetchBatch();
    const items = Array.isArray(batch?.data) ? batch.data : [];
    totalDiscovered += items.length;

    if (items.length === 0) {
      break;
    }

    // eslint-disable-next-line no-console
    console.log(`Batch ${attempts}: deleting ${items.length} images`);

    for (const item of items) {
      try {
        const result = await deleteImage(item);
        if (result?.skipped) {
          skipped += 1;
          continue;
        }
        totalDeleted += DRY_RUN ? 0 : 1;
        // eslint-disable-next-line no-console
        const { id, name } = createIdentifier(item);
        const label = id ?? name ?? "unknown";
        console.log(DRY_RUN ? `  ☐ scheduled id=${label}` : `  ✓ removed id=${label}`);
      } catch (error) {
        const { id, name } = createIdentifier(item);
        failures.push({ id, name, error });
        // eslint-disable-next-line no-console
        console.error(`  ✗ failed to remove id=${id ?? 'unknown'} (${name ?? 'unknown'}):`, error);
      }
    }

    if (MAX_BATCHES > 0 && attempts >= MAX_BATCHES) {
      console.warn(`Reached MAX_BATCHES=${MAX_BATCHES}. Stopping early.`);
      break;
    }
  }

  if (failures.length > 0) {
    const failedNames = failures.map((failure) => failure.id ?? failure.name ?? "unknown").join(", ");
    throw new Error(`Deleted ${totalDeleted} images, but failed for: ${failedNames}`);
  }

  // eslint-disable-next-line no-console
  const durationSeconds = ((performance.now() - start) / 1000).toFixed(2);
  console.log(
    DRY_RUN
      ? `Dry-run complete: reviewed ${totalDiscovered} images in ${durationSeconds}s (skipped ${skipped}).`
      : `Complete: removed ${totalDeleted} images (processed ${totalDiscovered}, skipped ${skipped}) in ${durationSeconds}s.`
  );
}

clearAllImages().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
