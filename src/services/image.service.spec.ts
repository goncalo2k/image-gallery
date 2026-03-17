/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import { faker } from '@faker-js/faker';
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { AppContext, Bindings } from '../app';
import type { ImageUploadFileRequest } from '../models/image-requests';
import { ImageMapper } from '../utils/image-mapper';
import { ImageService } from './image.service';

const mapper = new ImageMapper();

type QueryParams = Record<string, string>;

const createMockContext = (options: { query?: QueryParams; db: D1Database }): AppContext => {
  const query = options.query ?? {};
  return {
    req: {
      query: (key: string) => query[key],
    },
    env: {
      ANALOGS_METADATA_DB: options.db,
    },
  } as unknown as AppContext;
};

interface DatabaseMockOptions {
  total?: unknown;
  metadataRejects?: boolean;
  countRejects?: boolean;
  metadataResults?: { results?: Record<string, unknown>[] } | null;
}

const createDatabaseMock = (rows: Record<string, unknown>[], options?: DatabaseMockOptions): D1Database => {
  const hasCustomTotal = options ? Object.prototype.hasOwnProperty.call(options, 'total') : false;
  const totalValue = hasCustomTotal ? options?.total : rows.length;

  const runResult = (options?.metadataResults ?? { results: rows }) as { results?: Record<string, unknown>[] };
  const metadataRunMock = options?.metadataRejects
    ? vi.fn().mockRejectedValue(new Error('metadata failed'))
    : vi.fn().mockResolvedValue(runResult);

  const metadataStatement = {
    bind: vi.fn(() => ({
      run: metadataRunMock,
    })),
    run: metadataRunMock,
  } as unknown as D1PreparedStatement;

  const countStatement = options?.countRejects
    ? ({
      first: vi.fn().mockRejectedValue(new Error('count failed')),
    } as unknown as D1PreparedStatement)
    : ({
      first: vi.fn().mockResolvedValue({ total: totalValue }),
    } as unknown as D1PreparedStatement);

  return {
    prepare: vi.fn((sql: string) => {
      if (sql.toLowerCase().includes('count')) {
        return countStatement;
      }

      return metadataStatement;
    }),
  } as unknown as D1Database;
};

const createImagesBindingMock = (resizedBuffer: ArrayBuffer) => {
  const responseMock = {
    arrayBuffer: vi.fn().mockResolvedValue(resizedBuffer),
  } as unknown as Response;

  const outputSpy = vi.fn().mockResolvedValue({
    response: () => responseMock,
  });

  const transformSpy = vi.fn();
  const transformer = {
    transform: transformSpy,
    output: outputSpy,
  };
  transformSpy.mockReturnValue(transformer);

  const inputSpy = vi.fn().mockReturnValue(transformer);

  return {
    binding: {
      input: inputSpy,
    } as unknown as Bindings['IMAGES'],
    spies: {
      inputSpy,
      transformSpy,
      outputSpy,
    },
  };
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ImageService.getImagesMetadata', () => {
  it('returns metadata with pagination info', async () => {
    const row = {
      name: faker.string.uuid(),
      description: faker.lorem.sentence(),
      content_type: 'image/png',
      created_at: faker.date.recent().toISOString(),
    };
    const total = faker.number.int({ min: 10, max: 50 });
    const db = createDatabaseMock([row], { total });
    const ctx = createMockContext({ query: { offset: '5', limit: '10' }, db });
    const service = new ImageService(mapper);
    const mappedRow = {
      name: row.name,
      description: 'mapped-description',
      contentType: 'mapped/type',
      createdAt: '2024-01-01T00:00:00.000Z',
    };
    const mapperSpy = vi.spyOn(mapper, 'mapRowToPartialImage').mockReturnValue(mappedRow);

    const response = await service.getImagesMetadata(ctx);

    expect(response).toEqual({
      data: [mappedRow],
      count: 1,
      offset: 5,
      limit: 10,
      total,
    });
    expect(mapperSpy).toHaveBeenCalledWith(row);
  });

  it('defaults pagination when params are invalid', async () => {
    const db = createDatabaseMock([], { total: 1 });
    const ctx = createMockContext({ query: { offset: '-10', limit: '-1' }, db });
    const service = new ImageService(mapper);

    const response = await service.getImagesMetadata(ctx);

    expect(response.offset).toBe(0);
    expect(response.limit).toBe(20); // default limit
  });

  it('still resolves when metadata total is missing but returns NaN', async () => {
    const db = createDatabaseMock([], { total: undefined });
    const ctx = createMockContext({ db });
    const service = new ImageService(mapper);

    const response = await service.getImagesMetadata(ctx);

    expect(response.count).toBe(0);
    expect(response.data).toEqual([]);
    expect(response.total).toBeNaN();
  });

  it('allows zero totals and surfaces pagination result', async () => {
    const db = createDatabaseMock([], { total: 0 });
    const ctx = createMockContext({ db });
    const service = new ImageService(mapper);

    const response = await service.getImagesMetadata(ctx);

    expect(response.total).toBe(0);
    expect(response.count).toBe(0);
    expect(response.data).toEqual([]);
  });
});

describe('ImageService.getImagesAuditLogs', () => {
  it('returns recent uploads and statistics with pagination metadata', async () => {
    const rows = Array.from({ length: 2 }, () => ({
      name: faker.string.uuid(),
      description: faker.lorem.words(3),
      content_type: 'image/jpeg',
      created_at: faker.date.recent().toISOString(),
    }));
    const totalImages = faker.number.int({ min: 20, max: 80 });
    const db = createDatabaseMock(rows, { total: totalImages });
    const ctx = createMockContext({ query: { offset: '0', limit: '200' }, db });
    const service = new ImageService(mapper);
    const mapperSpy = vi.spyOn(mapper, 'mapRowToPartialImage').mockImplementation((row) => ({
      name: row.name as string,
      description: row.description as string,
      contentType: (row as { content_type: string }).content_type,
      createdAt: (row as { created_at: string }).created_at,
    }));

    const response = await service.getImagesAuditLogs(ctx);

    expect(response.data).toEqual({
      recentUploads: [
        {
          name: rows[0].name,
          description: rows[0].description,
          contentType: rows[0].content_type,
          createdAt: rows[0].created_at,
        },
        {
          name: rows[1].name,
          description: rows[1].description,
          contentType: rows[1].content_type,
          createdAt: rows[1].created_at,
        },
      ],
      statistics: {
        totalImages,
        lastUpdated: expect.any(String),
      },
    });
    expect(response.count).toBe(2);
    expect(response.limit).toBe(100); // max limit clamp
    expect(response.total).toBe(totalImages);
    expect(mapperSpy).toHaveBeenCalledTimes(rows.length);
  });

  it('throws when metadata query fails', async () => {
    const rows = [{ name: 'broken' }];
    const db = createDatabaseMock(rows, { metadataRejects: true });
    const ctx = createMockContext({ db });
    const service = new ImageService(mapper);

    await expect(service.getImagesAuditLogs(ctx)).rejects.toThrow("Couldn't list all metadata entries from D1");
  });

  it('throws when metadata query resolves without results', async () => {
    const rows = [{ name: 'missing-results' }];
    const db = createDatabaseMock(rows, { metadataResults: { results: undefined } });
    const ctx = createMockContext({ db });
    const service = new ImageService(mapper);

    await expect(service.getImagesAuditLogs(ctx)).rejects.toThrow("Couldn't list all metadata entries from D1");
  });

  it('throws when count query fails', async () => {
    const rows = [{ name: 'count-failure' }];
    const db = createDatabaseMock(rows, { countRejects: true });
    const ctx = createMockContext({ db });
    const service = new ImageService(mapper);

    await expect(service.getImagesAuditLogs(ctx)).rejects.toThrow("Couldn't get number of images stored in D1");
  });

  it('returns NaN total when count rows omit totals', async () => {
    const rows = [{ name: 'no-total' }];
    const db = createDatabaseMock(rows, { total: undefined });
    const ctx = createMockContext({ db });
    const service = new ImageService(mapper);

    const response = await service.getImagesAuditLogs(ctx);
    expect(response.data).toBeDefined();
    expect(response.count).toBe(1);
    expect(response.data?.recentUploads).toHaveLength(1);
    expect(response.total).toBeNaN();
    expect(response.data?.statistics.totalImages).toBeNaN();
  });
});

describe('ImageService validation', () => {
  const service = new ImageService(mapper);

  it('returns undefined when blob cannot be found by id', async () => {
    const bucketGet = vi.fn().mockResolvedValue(undefined);
    const bucket = {
      get: bucketGet,
    } as unknown as R2Bucket;

    const result = await service.getImageById(bucket, {} as D1Database, 'missing-id');

    expect(result).toBeUndefined();
    expect(bucketGet).toHaveBeenCalledWith('missing-id');
  });

  it('returns undefined when metadata is missing required fields', async () => {
    const blobValue = new Blob(['test'], { type: 'image/png' });
    const bucket = {
      get: vi.fn().mockResolvedValue({
        blob: vi.fn().mockResolvedValue(blobValue),
        httpMetadata: { contentType: 'image/png' },
      }),
    } as unknown as R2Bucket;

    const db = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({ name: 'file.png', description: undefined, created_at: undefined }),
        }),
      }),
    } as unknown as D1Database;

    const result = await service.getImageById(bucket, db, 'incomplete');

    expect(result).toBeUndefined();
  });

  it('flags invalid names on upload', async () => {
    const ctx = {
      env: {
        ANALOGS_BUCKET: {} as R2Bucket,
        ANALOGS_METADATA_DB: {} as D1Database,
        AI: {} as Ai,
      },
      executionCtx: { waitUntil: vi.fn() },
    } as unknown as AppContext;

    const body = {
      name: '../invalid',
      file: new File(['content'], '../invalid', { type: 'image/png' }),
    } as ImageUploadFileRequest;

    const response = await service.uploadImage(ctx, body);
    expect(response).toEqual({ errorMessage: 'Invalid file name format', status: 400 });
  });

  it('flags missing file uploads', async () => {
    const ctx = {
      env: {
        ANALOGS_BUCKET: {} as R2Bucket,
        ANALOGS_METADATA_DB: {} as D1Database,
        AI: {} as Ai,
        IMAGES: {} as Bindings['IMAGES'],
        MAX_UPLOAD_SIZE_MB: 20,
      },
      executionCtx: { waitUntil: vi.fn() },
    } as unknown as AppContext;

    const body = {
      file: undefined,
    } as unknown as ImageUploadFileRequest;

    const response = await service.uploadImage(ctx, body);
    expect(response).toEqual({ errorMessage: 'No file was uploaded', status: 400 });
  });

  it('rejects files that exceed the configured upload size limit', async () => {
    const ctx = {
      env: {
        ANALOGS_BUCKET: {} as R2Bucket,
        ANALOGS_METADATA_DB: {} as D1Database,
        AI: {} as Ai,
        IMAGES: {} as Bindings['IMAGES'],
        MAX_UPLOAD_SIZE_MB: 2,
      },
      executionCtx: { waitUntil: vi.fn() },
    } as unknown as AppContext;

    const oversizedFile = new File([new Uint8Array(3 * 1024 * 1024)], 'large.png', { type: 'image/png' });
    const body = {
      file: oversizedFile,
    } as ImageUploadFileRequest;

    const response = await service.uploadImage(ctx, body);

    expect(response).toEqual({ errorMessage: 'The uploaded file is too big - try files under 2mb', status: 400 });
  });
});

describe('ImageService AI integration', () => {
  const service = new ImageService(mapper);
  const internals = service as unknown as {
    generateImageAltText: (ai: Ai, images: Bindings['IMAGES'] | undefined, buffer: ArrayBuffer) => Promise<string>;
    resizeImageForAI: (images: Bindings['IMAGES'] | undefined, buffer: ArrayBuffer) => Promise<ArrayBuffer>;
  };

  it('resizes large buffers before invoking the AI model', async () => {
    const resizedBuffer = new Uint8Array([9, 9, 9]).buffer;
    const { binding, spies } = createImagesBindingMock(resizedBuffer);
    const runSpy = vi.fn().mockResolvedValue({ response: 'caption' });
    const aiMock = { run: runSpy } as unknown as Ai;
    const largeBuffer = new Uint8Array(2 * 1024 * 1024).buffer;

    const caption = await internals.generateImageAltText(aiMock, binding, largeBuffer);

    expect(caption).toBe('caption');
    expect(spies.inputSpy).toHaveBeenCalledTimes(1);
    const payload = runSpy.mock.calls[0][1];
    expect(payload.image).toEqual(Array.from(new Uint8Array(resizedBuffer)));
  });

  it('skips resizing when binding is unavailable and uses original buffer', async () => {
    const runSpy = vi.fn().mockResolvedValue({ response: 'small' });
    const aiMock = { run: runSpy } as unknown as Ai;
    const smallBuffer = new Uint8Array(16).buffer;

    const caption = await internals.generateImageAltText(aiMock, undefined, smallBuffer);

    expect(caption).toBe('small');
    const payload = runSpy.mock.calls[0][1];
    expect(payload.image).toEqual(Array.from(new Uint8Array(smallBuffer)));
  });

  it('falls back to the original buffer if resizing fails', async () => {
    const failingImages = {
      input: vi.fn(() => {
        throw new Error('boom');
      }),
    } as unknown as Bindings['IMAGES'];

    const largeBuffer = new Uint8Array(2 * 1024 * 1024).buffer;
    const resized = await internals.resizeImageForAI(failingImages, largeBuffer);

    expect(resized).toBe(largeBuffer);
  });
});
