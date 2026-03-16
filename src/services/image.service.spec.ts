/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { faker } from '@faker-js/faker';
import { describe, it, expect, vi } from 'vitest';
import type { AppContext } from '../app';
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

const createDatabaseMock = (rows: Record<string, unknown>[], total = rows.length): D1Database => {
  return {
    prepare: vi.fn((sql: string) => {
      if (sql.toLowerCase().includes('count')) {
        return {
          first: vi.fn().mockResolvedValue({ total }),
        } as unknown as D1PreparedStatement;
      }

      const runResult = { results: rows };

      return {
        bind: vi.fn(() => ({
          run: vi.fn().mockResolvedValue(runResult),
        })),
        run: vi.fn().mockResolvedValue(runResult),
      } as unknown as D1PreparedStatement;
    }),
  } as unknown as D1Database;
};

describe('ImageService.getImagesMetadata', () => {
  it('returns metadata with pagination info', async () => {
    const row = {
      name: faker.string.uuid(),
      description: faker.lorem.sentence(),
      content_type: 'image/png',
      created_at: faker.date.recent().toISOString(),
    };
    const total = faker.number.int({ min: 10, max: 50 });
    const db = createDatabaseMock([row], total);
    const ctx = createMockContext({ query: { offset: '5', limit: '10' }, db });
    const service = new ImageService(mapper);

    const response = await service.getImagesMetadata(ctx);

    expect(response).toEqual({
      data: [
        {
          name: row.name,
          description: row.description,
          contentType: row.content_type,
          createdAt: row.created_at,
        },
      ],
      count: 1,
      offset: 5,
      limit: 10,
      total,
    });
  });

  it('defaults pagination when params are invalid', async () => {
    const db = createDatabaseMock([]);
    const ctx = createMockContext({ query: { offset: '-10', limit: '-1' }, db });
    const service = new ImageService(mapper);

    const response = await service.getImagesMetadata(ctx);

    expect(response.offset).toBe(0);
    expect(response.limit).toBe(20); // default limit
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
    const db = createDatabaseMock(rows, totalImages);
    const ctx = createMockContext({ query: { offset: '0', limit: '200' }, db });
    const service = new ImageService(mapper);

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
  });
});

describe('ImageService validation', () => {
  const service = new ImageService(mapper);

  it('rejects invalid names when fetching by name', async () => {
    await expect(
      service.getImageByName({} as R2Bucket, {} as D1Database, '../evil')
    ).rejects.toThrow('Invalid file name format');
  });

  it('rejects invalid names on upload', async () => {
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

    await expect(service.uploadImage(ctx, body)).rejects.toThrow('Invalid file name format');
  });
});
