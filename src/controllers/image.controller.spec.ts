import { faker } from '@faker-js/faker';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import type { Mock } from 'vitest';
import type { AppContext } from '../app';
import type { ImageService } from '../services/image.service';
import type { ImageMapper } from '../utils/image-mapper';
import { ImageController } from './image.controller';

type WorkerExecutionContext = NonNullable<AppContext['executionCtx']>;

const loggerErrorSpy = vi.fn();
vi.mock('../utils/logger', () => ({
  requestLogger: vi.fn(() => ({ error: loggerErrorSpy })),
}));

const cachePutSpy = vi.fn();
beforeAll(() => {
  (globalThis as unknown as { caches: CacheStorage }).caches = {
    default: {
      put: cachePutSpy,
    } as unknown as Cache,
  } as unknown as CacheStorage;
});

const createServiceMock = () => {
  const mocks = {
    getImagesAuditLogs: vi.fn(),
    getImagesMetadata: vi.fn(),
    getImageById: vi.fn(),
    uploadImage: vi.fn(),
    uploadExternalImage: vi.fn(),
    deleteImage: vi.fn(),
  } satisfies Record<string, Mock>;

  return { service: mocks as unknown as ImageService, mocks };
};

const createMapperMock = () => {
  const mocks = {
    mapFormDataToImageUploadFileRequest: vi.fn(),
    mapFormDataToImageUploadUrlRequest: vi.fn(),
    mapImageUploadUrlRequestToImageUploadFileRequest: vi.fn(),
  } satisfies Record<string, Mock>;

  return { mapper: mocks as unknown as ImageMapper, mocks };
};

const createContext = (overrides?: Partial<AppContext>) => {
  const jsonSpy = vi.fn((body: unknown, init?: number | ResponseInit) => {
    const status = typeof init === 'number' ? init : init?.status ?? 200;
    return { body, status } as Response;
  });
  const baseReq = {
    path: faker.internet.url(),
    method: faker.internet.httpMethod(),
    param: vi.fn(),
    formData: vi.fn(),
    header: vi.fn(),
  };
  const baseRes = {
    status: 200,
    headers: new Map<string, string>(),
  };
  const baseEnv = {
    ANALOGS_BUCKET: {} as R2Bucket,
    ANALOGS_METADATA_DB: {} as D1Database,
    ALT_HEADER_NAME: faker.string.alphanumeric(8),
    AI: {} as Ai,
    CLIENT_ID_HEADER: 'x-client-id',
    CLIENT_SECRET_HEADER: 'x-client-secret',
    CLIENT_ID: 'client',
    CLIENT_SECRET: 'secret',
    ALLOWED_ORIGINS: '*',
    ENABLE_AUTH: false,
    AUTH_ROUTES: '',
    LOG_LEVEL: 'info',
  } as AppContext['env'];

  const req = { ...baseReq } as unknown as AppContext['req'];
  if (overrides?.req) {
    Object.assign(req, overrides.req);
  }

  const res = { ...baseRes } as unknown as AppContext['res'];
  if (overrides?.res) {
    Object.assign(res, overrides.res);
  }

  const env = { ...baseEnv, ...(overrides?.env ?? {}) } as AppContext['env'];

  const ctx: AppContext = {
    req,
    res,
    env,
    executionCtx:
      overrides?.executionCtx ??
      ({
        waitUntil: vi.fn((promise: Promise<unknown>) => {
          promise.catch(() => undefined);
          return undefined;
        }),
        passThroughOnException: vi.fn(),
        props: {},
      } as WorkerExecutionContext),
    json: overrides?.json ?? (jsonSpy as unknown as AppContext['json']),
    set: overrides?.set ?? vi.fn(),
    get: overrides?.get ?? vi.fn(),
  } as AppContext;

  return { ctx, jsonSpy };
};

describe('ImageController', () => {
  beforeEach(() => {
    loggerErrorSpy.mockReset();
    cachePutSpy.mockReset();
  });

  it('returns audit logs from service', async () => {
    const { service, mocks: serviceMocks } = createServiceMock();
    const { mapper, mocks: _mapperMocks } = createMapperMock();
    const controller = new ImageController(service, mapper);
    const { ctx, jsonSpy } = createContext();
    const auditData = { recentUploads: [], statistics: { totalImages: 0, totalSizeBytes: 0, lastUpdated: new Date().toISOString() } };
    (serviceMocks.getImagesAuditLogs as Mock).mockResolvedValue(auditData);

    const response = await controller.getImagesAudit(ctx);

    expect(serviceMocks.getImagesAuditLogs).toHaveBeenCalledWith(ctx);
    expect(jsonSpy).toHaveBeenCalledWith({ data: auditData });
    expect(response).toEqual({ body: { data: auditData }, status: 200 });
  });

  it('logs error when metadata retrieval fails', async () => {
    const { service, mocks: serviceMocks } = createServiceMock();
    const { mapper } = createMapperMock();
    const controller = new ImageController(service, mapper);
    const { ctx } = createContext();
    (serviceMocks.getImagesMetadata as Mock).mockRejectedValue(new Error('db down'));

    const result = await controller.getImagesMetada(ctx);

    expect(loggerErrorSpy).toHaveBeenCalled();
    expect(result).toEqual({ body: { errorMessage: 'Failed to get images.' }, status: 500 });
  });

  it('returns image response with headers when found', async () => {
    const { service, mocks: serviceMocks } = createServiceMock();
    const { mapper } = createMapperMock();
    const controller = new ImageController(service, mapper);
    const name = faker.string.uuid();
    const { ctx } = createContext({
      req: {
        param: vi.fn().mockImplementation(() => name),
        raw: new Request(`https://example.com/images/${name}`),
      } as unknown as AppContext['req'],
      env: {
        ANALOGS_BUCKET: {} as R2Bucket,
        ANALOGS_METADATA_DB: {} as D1Database,
        ALT_HEADER_NAME: 'X-Image-Alt',
      } as AppContext['env'],
      executionCtx: {
        waitUntil: vi.fn((promise: Promise<unknown>) => {
          promise.catch(() => undefined);
          return undefined;
        }),
        passThroughOnException: vi.fn(),
        props: {},
      } as WorkerExecutionContext,
    });

    const description = faker.lorem.sentence();
    const contentType = 'image/png';
    const file = new File([faker.string.binary({ length: 10 })], `${name}.png`, { type: contentType });
    (serviceMocks.getImageById as Mock).mockResolvedValue({
      name,
      description,
      contentType,
      createdAt: new Date().toISOString(),
      file,
    });

    const response = await controller.getImage(ctx);

    expect(serviceMocks.getImageById).toHaveBeenCalled();
    expect(response.headers.get('Content-Type')).toBe(contentType);
    expect(response.headers.get('X-Image-Alt')).toBe(description);
  });

  it('returns 404 response when image is missing', async () => {
    const { service, mocks: serviceMocks } = createServiceMock();
    const { mapper } = createMapperMock();
    const controller = new ImageController(service, mapper);
    const name = faker.string.uuid();
    const { ctx, jsonSpy } = createContext({
      req: {
        param: vi.fn().mockReturnValue(name),
        raw: new Request(`https://example.com/images/${name}`),
      } as unknown as AppContext['req'],
    });

    (serviceMocks.getImageById as Mock).mockResolvedValue(undefined);

    const response = await controller.getImage(ctx);

    expect(jsonSpy).toHaveBeenCalledWith({ errorMessage: `Image with ${name} not found` }, 404);
    expect(response).toEqual({ body: { errorMessage: `Image with ${name} not found` }, status: 404 });
  });

  it('uploads image via mapper and service', async () => {
    const { service, mocks: serviceMocks } = createServiceMock();
    const { mapper, mocks: mapperMocks } = createMapperMock();
    const controller = new ImageController(service, mapper);
    const formData = new FormData();
    const file = new File(['body'], `${faker.string.alphanumeric(6)}.png`, { type: 'image/png' });
    formData.append('file', file);
    const mappedRequest = { file };
    (mapperMocks.mapFormDataToImageUploadFileRequest as Mock).mockReturnValue(mappedRequest);
    (serviceMocks.uploadImage as Mock).mockResolvedValue({ data: {}, status: 202 });

    const { ctx } = createContext({
      req: {
        formData: vi.fn().mockResolvedValue(formData),
      } as unknown as AppContext['req'],
    });

    const response = await controller.uploadImage(ctx);

    expect(mapperMocks.mapFormDataToImageUploadFileRequest).toHaveBeenCalledWith(formData);
    expect(serviceMocks.uploadImage).toHaveBeenCalledWith(ctx, mappedRequest);
    expect(response).toEqual({ body: { data: {}, status: 202 }, status: 202 });
  });

  it('uploads external image by mapping url request', async () => {
    const { service, mocks: serviceMocks } = createServiceMock();
    const { mapper, mocks: mapperMocks } = createMapperMock();
    const controller = new ImageController(service, mapper);
    const formData = new FormData();
    const mappedUrlRequest = { fileUrl: faker.internet.url() };
    (mapperMocks.mapFormDataToImageUploadUrlRequest as Mock).mockReturnValue(mappedUrlRequest);
    (serviceMocks.uploadExternalImage as Mock).mockResolvedValue({ data: {}, status: 201 });

    const { ctx } = createContext({
      req: {
        formData: vi.fn().mockResolvedValue(formData),
      } as unknown as AppContext['req'],
    });

    const response = await controller.uploadExternalSourceImage(ctx);

    expect(mapperMocks.mapFormDataToImageUploadUrlRequest).toHaveBeenCalledWith(formData);
    expect(serviceMocks.uploadExternalImage).toHaveBeenCalledWith(ctx, mappedUrlRequest);
    expect(response.status).toBe(201);
  });

  it('returns delete response status from service', async () => {
    const { service, mocks: serviceMocks } = createServiceMock();
    const { mapper } = createMapperMock();
    const controller = new ImageController(service, mapper);
    (serviceMocks.deleteImage as Mock).mockResolvedValue({ status: 204 });
    const name = faker.string.uuid();
    const { ctx } = createContext({
      req: {
        param: vi.fn().mockReturnValue(name),
      } as unknown as AppContext['req'],
    });

    const response = await controller.deleteImage(ctx);

    expect(serviceMocks.deleteImage).toHaveBeenCalledWith(ctx, name);
    expect(response).toEqual({ body: undefined, status: 204 });
  });

  it('propagates bad requests from service during upload', async () => {
    const { service, mocks: serviceMocks } = createServiceMock();
    const { mapper, mocks: mapperMocks } = createMapperMock();
    const controller = new ImageController(service, mapper);
    const formData = new FormData();
    const mappedRequest = { file: new File(['body'], 'test.png', { type: 'image/png' }) };
    (mapperMocks.mapFormDataToImageUploadFileRequest as Mock).mockReturnValue(mappedRequest);
    (serviceMocks.uploadImage as Mock).mockResolvedValue({ errorMessage: 'Invalid file name format', status: 400 });

    const { ctx, jsonSpy } = createContext({
      req: {
        formData: vi.fn().mockResolvedValue(formData),
      } as unknown as AppContext['req'],
    });

    const response = await controller.uploadImage(ctx);

    expect(jsonSpy).toHaveBeenCalledWith({ errorMessage: 'Invalid file name format', status: 400 }, 400);
    expect(response).toEqual({ body: { errorMessage: 'Invalid file name format', status: 400 }, status: 400 });
  });
});
