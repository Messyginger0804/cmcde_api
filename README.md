Fastify API (Standalone)

Overview
- Mirrors a subset of Next.js routes under `cde-next/src/app/api` so the backend can run independently.
- Endpoints implemented now:
  - `POST /api/fake`
  - `GET /api/truck-data/sections`
  - `GET /api/truck-data/damage-types`
  - `GET /api/truck-data/severity-levels`
  - `POST /api/vehicle/vin`
  - `POST /api/register`, `POST /api/auth/login`, etc.

Run
- From `cmcde_api/`:
  - `npm start` to launch on port `4000` (default).
  - `PORT=5000 npm start` to override port.

Notes
- Fastify v5: Code is aligned with current v5 docs (multipart limits, basic schemas on key routes, optional static serving).
- Static files: To serve files under `public/` (e.g., uploads), install `@fastify/static` and restart:
  - `npm i @fastify/static`
  - Files saved to `public/uploads` will be available at `/uploads/...`.
- Multipart: `@fastify/multipart` is configured with limits (25MB/file, 10 files, 100 fields). Adjust in `src/server.js` if needed.
- Prisma is optional. If `@prisma/client` is installed and `DATABASE_URL` is set, certain routes will upsert data.
- If Prisma is not available, routes fall back to static responses or skip persistence.
- CORS support is optional via `@fastify/cors`. If not installed, the server still runs.

Next steps
- Add auth integration mirroring NextAuth (JWT cookie parsing).
- Implement remaining API routes from Next.js with DB access.
- Add request validation and error schemas.

# cmcde_api
