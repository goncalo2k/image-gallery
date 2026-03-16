import type { OpenAPIObject } from 'openapi3-ts/oas31';
import type { AppContext } from '../app';

export function buildRuntimeOpenApiSpec(c: AppContext): unknown {
  const spec = structuredClone(openApiSpec);
  const forwardedProto = c.req.header('X-Forwarded-Proto');
  const url = new URL(c.req.url);
  const protocol = forwardedProto ?? url.protocol.replace(':', '');
  const host = c.req.header('Host') ?? url.host;
  spec.servers = [
    {
      url: `${protocol}://${host}`,
      description: 'Current host',
    },
    ...(openApiSpec.servers ?? []),
  ];
  return spec;
};


export const openApiSpec: OpenAPIObject = {
  openapi: '3.1.0',
  info: {
    title: 'Image Gallery API',
    version: '1.0.0',
    description: 'REST API for managing images stored in Cloudflare R2 with metadata persisted on D1.',
    contact: {
      name: 'Image Gallery Team',
      url: 'https://github.com/goncalo2k/image-gallery',
    },
  },
  servers: [
    {
      url: 'https://{subdomain}.goncalo2k.pt',
      description: 'Cloudflare Workers deployment',
      variables: {
        subdomain: {
          default: 'image-gallery',
          description: 'Subdomain assigned to this service under goncalo2k.pt',
        },
      },
    },
    {
      url: 'http://localhost:8787',
      description: 'Local development',
    },
  ],
  tags: [
    { name: 'Images', description: 'Manage image uploads and metadata' },
    { name: 'Audit', description: 'Image audit and storage statistics' },
    { name: 'System', description: 'Health checks and docs' },
  ],
  security: [
    {
      ClientIdHeader: [],
      ClientSecretHeader: [],
    },
  ],
  paths: {
    '/': {
      get: {
        tags: ['System'],
        summary: 'Service health',
        description: 'Returns a simple payload with service status and timestamp.',
        responses: {
          '200': {
            description: 'Health payload',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string', example: 'service healthy' },
                    timestamp: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
        },
        security: [],
      },
    },
    '/images': {
      get: {
        tags: ['Images'],
        summary: 'List images',
        description: 'Returns paginated metadata for all processed images.',
        parameters: [
          {
            name: 'offset',
            in: 'query',
            description: 'Index of the first record to return.',
            schema: { type: 'integer', minimum: 0, default: 0 },
          },
          {
            name: 'limit',
            in: 'query',
            description: 'Maximum number of records to return (max 100).',
            schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          },
        ],
        responses: {
          '200': {
            description: 'Paginated image metadata',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ImageListResponse' },
              },
            },
          },
        },
      },
      post: {
        tags: ['Images'],
        summary: 'Upload an image',
        description: 'Uploads an image file, stores it in R2 and writes metadata into D1.',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  file: { type: 'string', format: 'binary', description: 'Image file' },
                  name: { type: 'string', description: 'Optional destination file name' },
                  description: { type: 'string', description: 'Optional friendly description' },
                },
                required: ['file'],
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Upload accepted',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/UploadResponse' },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '500': { $ref: '#/components/responses/ServerError' },
        },
      },
    },
    '/images/external': {
      post: {
        tags: ['Images'],
        summary: 'Upload from external URL',
        description: 'Fetches an image from a remote URL and ingests it into the gallery.',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  fileUrl: { type: 'string', format: 'uri', description: 'Source image URL' },
                  name: { type: 'string', description: 'Optional destination file name' },
                  description: { type: 'string', description: 'Optional friendly description' },
                },
                required: ['fileUrl'],
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Upload accepted',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/UploadResponse' },
              },
            },
          },
          '400': { $ref: '#/components/responses/BadRequest' },
          '500': { $ref: '#/components/responses/ServerError' },
        },
      },
    },
    '/images/audit': {
      get: {
        tags: ['Audit'],
        summary: 'Recent uploads & statistics',
        description: 'Returns paginated audit information plus aggregate storage statistics.',
        parameters: [
          {
            name: 'offset',
            in: 'query',
            schema: { type: 'integer', minimum: 0, default: 0 },
          },
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          },
        ],
        responses: {
          '200': {
            description: 'Audit logs and statistics',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/AuditLogsResponse' },
              },
            },
          },
        },
      },
    },
    '/images/{name}': {
      get: {
        tags: ['Images'],
        summary: 'Download an image',
        description: 'Streams the requested image if it exists.',
        parameters: [
          {
            name: 'name',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'Image file name',
          },
        ],
        responses: {
          '200': {
            description: 'Image binary',
            content: {
              'image/*': {
                schema: { type: 'string', format: 'binary' },
              },
            },
          },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
      delete: {
        tags: ['Images'],
        summary: 'Delete an image',
        parameters: [
          {
            name: 'name',
            in: 'path',
            required: true,
            schema: { type: 'string' },
          },
        ],
        responses: {
          '204': {
            description: 'Image deleted',
          },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/openapi.json': {
      get: {
        tags: ['System'],
        summary: 'OpenAPI schema',
        description: 'Returns the OpenAPI/Swagger document for this API.',
        responses: {
          '200': {
            description: 'OpenAPI document',
            content: {
              'application/json': {
                schema: { type: 'object' },
              },
            },
          },
        },
        security: [],
      },
    },
  },
  components: {
    schemas: {
      ImageMetadata: {
        type: 'object',
        properties: {
          name: { type: 'string', example: 'sunrise.png' },
          description: { type: 'string' },
          contentType: { type: 'string', example: 'image/png' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      ImageListResponse: {
        type: 'object',
        properties: {
          data: {
            type: 'array',
            items: { $ref: '#/components/schemas/ImageMetadata' },
          },
          count: { type: 'integer', minimum: 0 },
          offset: { type: 'integer', minimum: 0 },
          limit: { type: 'integer', minimum: 1, maximum: 100 },
          total: { type: 'integer', minimum: 0 },
        },
      },
      AuditStatistics: {
        type: 'object',
        properties: {
          totalImages: { type: 'integer', minimum: 0 },
          lastUpdated: { type: 'string', format: 'date-time' },
        },
      },
      AuditLogsResponse: {
        type: 'object',
        properties: {
          data: {
            type: 'object',
            properties: {
              recentUploads: {
                type: 'array',
                items: { $ref: '#/components/schemas/ImageMetadata' },
              },
              statistics: { $ref: '#/components/schemas/AuditStatistics' },
            },
          },
          count: { type: 'integer', minimum: 0 },
          offset: { type: 'integer', minimum: 0 },
          limit: { type: 'integer', minimum: 1, maximum: 100 },
          total: { type: 'integer', minimum: 0 },
        },
      },
      UploadResponse: {
        type: 'object',
        properties: {
          data: { $ref: '#/components/schemas/ImageMetadata' },
          status: { type: 'integer', example: 201 },
          errorMessage: { type: 'string' },
        },
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          errorMessage: { type: 'string' },
        },
      },
    },
    responses: {
      BadRequest: {
        description: 'Bad request',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      NotFound: {
        description: 'Resource not found',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
      ServerError: {
        description: 'Unexpected server error',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
    },
    securitySchemes: {
      ClientIdHeader: {
        type: 'apiKey',
        in: 'header',
        name: 'x-client-id',
        description: 'Client identifier header.',
      },
      ClientSecretHeader: {
        type: 'apiKey',
        in: 'header',
        name: 'x-client-secret',
        description: 'Client secret header.',
      },
    },
  },
};
