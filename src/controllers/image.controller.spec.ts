import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import type { Mock } from 'vitest';
import { faker } from '@faker-js/faker';
import { ImageController } from './image.controller';
import type { ImageService } from '../services/image.service';
import type { ImageMapper } from '../utils/image-mapper';
import type { AppContext } from '../app';

const loggerErrorSpy = vi.fn();
vi.mock('../utils/logger', () => ({
  requestLogger: vi.fn(() => ({ error: loggerErrorSpy })),
}));

const cachePutSpy = vi.fn();
beforeAll(() => {
  (globalThis as any).caches = {
    default: {
      put: cachePutSpy,
    },
  };
});

const createServiceMock = () => ({
  getImagesAuditLogs: vi.fn(),
  getImagesMetadata: vi.fn(),
  getImageByName: vi.fn(),
  uploadImage: vi.fn(),
  uploadExternalImage: vi.fn(),
  deleteImage: vi.fn(),
}) as unknown as ImageService;

const createMapperMock = () => ({
  mapFormDataToImageUploadFileRequest: vi.fn(),
  mapFormDataToImageUploadUrlRequest: vi.fn(),
  mapImageUploadUrlRequestToImageUploadFileRequest: vi.fn(),
}) as unknown as ImageMapper;

const createContext = (overrides?: Partial<AppContext>) => {
  const jsonSpy = vi.fn((body: unknown, status = 200) => ({ body, status } as unknown as Response));
  const baseReq = {
    path: faker.internet.url(),
    method: faker.internet.httpMethod(),
    param: vi.fn(),
    formData: vi.fn(),
    header: vi.fn(),
  } as any;
  const baseRes = {
    status: 200,
    headers: new Map<string, string>(),
  } as any;
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

  const ctx: AppContext = {
    ...(overrides ?? {}),
    req: { ...baseReq, ...(overrides?.req ?? {}) },
    res: { ...baseRes, ...(overrides?.res ?? {}) },
    env: { ...baseEnv, ...(overrides?.env ?? {}) },
    executionCtx: overrides?.executionCtx ?? { waitUntil: vi.fn(), passThroughOnException: vi.fn(), props: {} },
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
    const service = createServiceMock();
    const mapper = createMapperMock();
    const controller = new ImageController(service, mapper);
    const { ctx, jsonSpy } = createContext();
    const auditData = { recentUploads: [], statistics: { totalImages: 0, lastUpdated: new Date().toISOString() } };
    (service.getImagesAuditLogs as unknown as Mock).mockResolvedValue(auditData);

    const response = await controller.getImagesAudit(ctx);

    expect(service.getImagesAuditLogs).toHaveBeenCalledWith(ctx);
    expect(jsonSpy).toHaveBeenCalledWith({ data: auditData });
    expect(response).toEqual({ body: { data: auditData }, status: 200 });
  });

  it('logs error when metadata retrieval fails', async () => {
    const service = createServiceMock();
    const mapper = createMapperMock();
    const controller = new ImageController(service, mapper);
    const { ctx } = createContext();
    (service.getImagesMetadata as unknown as Mock).mockRejectedValue(new Error('db down'));

    const result = await controller.getImagesMetada(ctx);

    expect(loggerErrorSpy).toHaveBeenCalled();
    expect(result).toEqual({ body: { errorMessage: 'Failed to get images.' }, status: 500 });
  });

  it('returns image response with headers when found', async () => {
    const service = createServiceMock();
    const mapper = createMapperMock();
    const controller = new ImageController(service, mapper);
    const name = faker.string.uuid();
    const { ctx } = createContext({
      req: {
        param: vi.fn().mockImplementation(() => name),
        raw: new Request(`https://example.com/images/${name}`),
      } as any,
      env: {
        ANALOGS_BUCKET: {} as R2Bucket,
        ANALOGS_METADATA_DB: {} as D1Database,
        ALT_HEADER_NAME: 'X-Image-Alt',
      } as any,
      executionCtx: {
        waitUntil: vi.fn((promise: Promise<unknown>) => promise.catch(() => undefined)),
        passThroughOnException: vi.fn(),
        props: {},
      },
    });

    const description = faker.lorem.sentence();
    const contentType = 'image/png';
    const file = new File([faker.string.binary({ length: 10 })], `${name}.png`, { type: contentType });
    (service.getImageByName as unknown as Mock).mockResolvedValue({
      name,
      description,
      contentType,
      createdAt: new Date().toISOString(),
      file,
    });

    const response = await controller.getImage(ctx);

    expect(service.getImageByName).toHaveBeenCalled();
    expect(response?.headers.get('Content-Type')).toBe(contentType);
    expect(response?.headers.get('X-Image-Alt')).toBe(description);
  });

  it('uploads image via mapper and service', async () => {
    const service = createServiceMock();
    const mapper = createMapperMock();
    const controller = new ImageController(service, mapper);
    const formData = new FormData();
    const file = new File(['body'], `${faker.string.alphanumeric(6)}.png`, { type: 'image/png' });
    formData.append('file', file);
    const mappedRequest = { file };
    (mapper.mapFormDataToImageUploadFileRequest as unknown as Mock).mockReturnValue(mappedRequest);
    (service.uploadImage as unknown as Mock).mockResolvedValue({ data: {}, status: 202 });

    const { ctx } = createContext({
      req: {
        formData: vi.fn().mockResolvedValue(formData),
      } as any,
    });

    const response = await controller.uploadImage(ctx);

    expect(mapper.mapFormDataToImageUploadFileRequest).toHaveBeenCalledWith(formData);
    expect(service.uploadImage).toHaveBeenCalledWith(ctx, mappedRequest);
    expect(response).toEqual({ body: { data: {}, status: 202 }, status: 202 });
  });

  it('uploads external image by mapping url request', async () => {
    const service = createServiceMock();
    const mapper = createMapperMock();
    const controller = new ImageController(service, mapper);
    const formData = new FormData();
    const mappedUrlRequest = { fileUrl: faker.internet.url() };
    (mapper.mapFormDataToImageUploadUrlRequest as unknown as Mock).mockReturnValue(mappedUrlRequest);
    (service.uploadExternalImage as unknown as Mock).mockResolvedValue({ data: {}, status: 201 });

    const { ctx } = createContext({
      req: {
        formData: vi.fn().mockResolvedValue(formData),
      } as any,
    });

    const response = await controller.uploadExternalSourceImage(ctx);

    expect(mapper.mapFormDataToImageUploadUrlRequest).toHaveBeenCalledWith(formData);
    expect(service.uploadExternalImage).toHaveBeenCalledWith(ctx, mappedUrlRequest);
    expect(response.status).toBe(201);
  });

  it('returns delete response status from service', async () => {
    const service = createServiceMock();
    const mapper = createMapperMock();
    const controller = new ImageController(service, mapper);
    (service.deleteImage as unknown as Mock).mockResolvedValue({ status: 204 });
    const name = faker.string.uuid();
    const { ctx } = createContext({
      req: {
        param: vi.fn().mockReturnValue(name),
      } as any,
    });

    const response = await controller.deleteImage(ctx);

    expect(service.deleteImage).toHaveBeenCalledWith(ctx, name);
    expect(response).toEqual({ body: undefined, status: 204 });
  });
});
