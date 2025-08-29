Fastify API (Standalone)

Overview
- Mirrors a subset of Next.js routes under `cde-next/src/app/api` so the backend can run independently.
- Endpoints implemented now:
  - `POST /api/fake`
  - `GET /api/truck-data/sections`
  - `GET /api/truck-data/damage-types`
  - `GET /api/truck-data/severity-levels`
  - `POST /api/vehicle/vin`

Run
- From `cmcde_api/`:
  - `npm start` to launch on port `4000` (default).
  - `PORT=5000 npm start` to override port.

Notes
- Prisma is optional. If `@prisma/client` is installed and `DATABASE_URL` is set, certain routes will upsert data.
- If Prisma is not available, routes fall back to static responses or skip persistence.
- CORS support is optional via `@fastify/cors`. If not installed, the server still runs.

Next steps
- Add auth integration mirroring NextAuth (JWT cookie parsing).
- Implement remaining API routes from Next.js with DB access.
- Add request validation and error schemas.

# cmcde_api
