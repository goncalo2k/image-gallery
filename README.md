# Image Gallery API

A modern image gallery API built with Cloudflare Workers, Hono framework, R2 blob storage and D1 database.

## Features

- 🖼️ Image upload and management
- ⚡ Fast performance with Cloudflare Workers
- 🛡️ Secure authentication and authorization
- 🔄 Database integration with Cloudflare D1
- 🔄 Blob storage integration with Cloudflare R2
- 📊 API documentation with Swagger/OpenAPI
- 🧪 Comprehensive error handling

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm or pnpm
- Cloudflare account
- Wrangler CLI installed globally (`pnpm install -g wrangler`)

### Installation

```bash
pnpm install
```

### Development

1. Clone the repository
2. Install dependencies:
   ```bash
   pnpm install
   ```
3. Start the development server:
   ```bash
   pnpm run dev
   ```
4. The API will be available at `http://localhost:8787`

### Database Setup

#### Local Development
```bash
pnpm run setup-local-db
```

#### Production Deployment
```bash
pnpm run deploy-db
```

### Deployment

To deploy to Cloudflare Workers:
```bash
pnpm run deploy
```

### Type Generation

To generate TypeScript types based on your Worker configuration:
```bash
pnpm run cf-typegen
```

## Project Structure

```
image-gallery/
├── src/
│   ├── app.ts          # Main application entry point
│   ├── routes/         # API route handlers
│   ├── middleware/     # Custom middleware (Auth, Logging, Cors and Misc. Security Checks)
│   ├── services/       # Business logic and DB/Blob Storage Interaction
│   ├── controllers/    # Recieves the requests for their specific routes and orchestrates service calls
│   └── types/          # Type definitions (API requests and responses, Internal Objects)
├── schema.sql          # Database schema (used with D1)
├── wrangler.jsonc      # Wrangler configuration
└── package.json        # Project dependencies and scripts
```

## API Endpoints

### General
- `GET /docs` - Retrieve API documentation
- `GET /` - Health check
### Images
- `GET /audit` - Retrieve 
- `GET /images` - Retrieve all images
- `GET /images/:id` - Retrieve a specific image by name
- `POST /images` - Upload a new image from a file
- `POST /images/external` - Upload a new image from an external URL
- `PUT /images/:id` - Update an existing image
- `DELETE /images/:id` - Delete an image

## Environment Variables

Create a `.dev.vars` file in the root directory with the following variables:

```bash
```
## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built with [Cloudflare Workers](https://workers.cloudflare.com/)
- Powered by [Hono](https://hono.dev/)
- Database powered by [Cloudflare D1](https://developers.cloudflare.com/d1/)
- Blob storage powered by [Cloudflare R2](https://developers.cloudflare.com/r2/)
- API documentation generated with [Hono OpenAPI](https://github.com/honojs/hono-openapi)