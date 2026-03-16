# Image Gallery API

Serverless image management API built on Cloudflare Workers. Metadata lands in D1, binaries live in R2, and descriptive alt text is generated on the fly through the Cloudflare AI binding.

## Highlights

- **Cloudflare-native stack** – Workers runtime with bindings for R2 (`ANALOGS_BUCKET`), D1 (`ANALOGS_METADATA_DB`), and AI (`AI`).
- **Secure ingestion** – Configurable auth middleware validates custom client headers, while CORS and strict CSP headers protect every response.
- **Multiple upload flows** – Accepts multipart file uploads or fetches remote images directly from a trusted URL.
- **AI-powered accessibility** – Generates alt text whenever none is provided so downstream consumers always get a useful description.
- **Audit + metrics** – `/images/audit` exposes paginated recent uploads plus aggregate counts to monitor storage usage.
- **OpenAPI-first** – `src/docs/openapi.ts` defines the schema; `/openapi.json` serves it and `/docs` renders Swagger UI (with runtime-aware host detection).
- **Strict file-name validation** – All routes use the same regex guard (letters/numbers/spaces/`_-` plus an optional extension) to prevent traversal or odd characters.
- **Observability** – Structured logs with correlation IDs, CSP, and header-level tracing help debug production requests quickly.
- **Tests close to the code** – Vitest specs sit alongside modules (`*.spec.ts`), covering middleware, controllers, and services.

## Getting Started

### Prerequisites

- Node.js 18+ (Workers dev server requires modern runtime)
- [pnpm](https://pnpm.io) (recommended) or npm
- Cloudflare account with Workers / D1 / R2 access
- Wrangler CLI (`pnpm install -g wrangler`)

### Install & Configure

```bash
pnpm install
cp .dev.vars.example .dev.vars   # update values for your environment
pnpm run setup-local-db          # optional: apply schema.sql to local D1
pnpm run dev                     # start wrangler dev server
```

The API will be available at `http://localhost:8787`.

### Common Scripts

| Command | Description |
| --- | --- |
| `pnpm run dev` | Run the worker locally via Wrangler. |
| `pnpm run setup-local-db` / `pnpm run deploy-db` | Execute `schema.sql` against local or remote D1. |
| `pnpm run cf-typegen` | Regenerate TypeScript bindings for Wrangler environments. |
| `pnpm run test` | Execute Vitest suites. |
| `pnpm run lint` / `pnpm run lint:fix` | ESLint (Workers-aware configuration). |
| `pnpm run deploy` | Deploy to Cloudflare Workers (uses `wrangler deploy`). |

## API Documentation

Swagger UI and the OpenAPI schema ship with the worker:

- `GET /docs` – Interactive docs powered by `@hono/swagger-ui`.
- `GET /openapi.json` – OpenAPI 3.1 document generated from `src/docs/openapi.ts` (servers list is patched with the current host at runtime).

## Image Naming Rules

- Allowed characters: lowercase letters (`a-z`), digits (`0-9`), spaces, underscores, and dashes.
- Optional single extension suffix (e.g., `sunrise.png`).
- Path separators and traversal strings (e.g., `../secret.png`) are rejected.
- Files must exist and be under 5 MB; uploads exceeding the limit or missing the `file` part receive a `400 Bad Request`.

The validation is enforced when reading, uploading, or importing by URL. Invalid names result in `400 Bad Request`.

## Middleware & Flow

1. **Logging** (`logger-middleware.ts`) – assigns/propagates correlation IDs and logs both request + response with duration.
2. **CORS** (`cors.middleware.ts`) – builds rules from `ALLOWED_ORIGINS`, `CLIENT_ID_HEADER`, and `CLIENT_SECRET_HEADER`.
3. **Auth** (`auth.middleware.ts`) – validates client headers for any path listed in `AUTH_ROUTES` (health/docs/openapi remain public).
4. **Security headers** (`security-headers.middleware.ts`) – CSP, Referrer-Policy, `nosniff` (relaxed CSP for `/docs`).

After middleware, incoming requests flow to the image router (`src/routes/image.routes.ts`), controller (`ImageController`), and service (`ImageService`).

## Project Structure

```
image-gallery/
├── src/
│   ├── app.ts                # Worker entrypoint & middleware wiring
│   ├── routes/               # Hono routers
│   ├── controllers/          # HTTP orchestration, caching, responses
│   ├── services/             # Business logic (R2/D1/AI access)
│   ├── middleware/           # logging, auth, cors, security headers
│   ├── utils/                # shared helpers (image mapper, logger, etc.)
│   ├── models/               # Request/response contracts
│   └── docs/                 # OpenAPI spec + helper
├── schema.sql                # D1 schema
├── wrangler.jsonc            # Worker + binding configuration
├── package.json / pnpm-lock  # Scripts & dependencies
└── .dev.vars.example         # Example Worker env vars
```

## REST Endpoints

| Method | Path | Description |
| --- | --- | --- |
| GET | `/` | Health payload. |
| GET | `/docs` | Swagger UI (no auth). |
| GET | `/openapi.json` | OpenAPI document (no auth). |
| GET | `/images` | Paginated metadata list (`offset`, `limit`). |
| GET | `/images/audit` | Audit logs + aggregate stats. |
| GET | `/images/:name` | Stream an image by validated name and expose an alt-text header. |
| POST | `/images` | Multipart upload (validates size, name, description). |
| POST | `/images/external` | Accepts `fileUrl` & optional metadata, fetches and stores the remote image. |
| DELETE | `/images/:name` | Remove image blob + metadata. |

> Use the `AUTH_ROUTES` env var to protect specific routes (comma-separated list). Requests must then include the configured `CLIENT_ID_HEADER` and `CLIENT_SECRET_HEADER` values matching `CLIENT_ID`/`CLIENT_SECRET`.

## Environment Variables

Copy `.dev.vars.example` and fill in the required values:

| Variable | Description |
| --- | --- |
| `ALT_HEADER_NAME` | Name of the response header that carries alt-text (default `x-image-alt-desc`). |
| `CLIENT_ID_HEADER` / `CLIENT_SECRET_HEADER` | Header names that carry auth credentials. |
| `CLIENT_ID` / `CLIENT_SECRET` | Credential pair enforced by the auth middleware. |
| `ALLOWED_ORIGINS` | CSV list of allowed origins for CORS (supports `*`). |
| `AUTH_ROUTES` | CSV list of paths that require auth. Leave blank to secure everything except health/docs/openapi. |
| `ENABLE_AUTH` | Set to `true`/`false` to toggle auth globally. |
| `LOG_LEVEL` | Pino log level (`debug`, `info`, `warn`, etc.). |

Cloudflare bindings are declared in `wrangler.jsonc`:

- `ANALOGS_BUCKET` (R2) – stores the binary files.
- `ANALOGS_METADATA_DB` (D1) – persists `name`, `description`, `content_type`, `created_at`.
- `AI` – Cloudflare AI binding used to generate descriptive text.

## Testing & Quality

- **Unit tests** – `pnpm run test` executes Vitest suites placed next to their source files.
- **Linting** – `pnpm run lint` runs ESLint with the Worker-aware config (`eslint.config.cjs`).
- **Type safety** – TypeScript 5.9 is enforced through the lint step and `tsconfig.json`.

## Deployment

- `pnpm run deploy` wraps `wrangler deploy --minify`.
- Ensure your Cloudflare account has the required D1, R2, and AI bindings configured as per `wrangler.jsonc`.

## License & Credits

- MIT License – see [LICENSE](LICENSE).
- Built with [Cloudflare Workers](https://workers.cloudflare.com/), [Hono](https://hono.dev/), [Cloudflare D1](https://developers.cloudflare.com/d1/), [Cloudflare R2](https://developers.cloudflare.com/r2/), and [Hono OpenAPI](https://github.com/honojs/hono-openapi).
