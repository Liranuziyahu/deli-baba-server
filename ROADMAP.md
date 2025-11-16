🗺️ Deli-Baba Roadmap
🚀 Sprint 1 – Infrastructure & Automation ✅ (Completed)
🎯 Goals

Set up full development environment (Backend + DB + Swagger)
and build a stable and secure API foundation.

✅ Tasks

 Installed Fastify + Prisma + Zod

 Connected MySQL & Redis via Docker Compose

 Created .env file and hid secrets from Git

 Built Postman → OpenAPI generation script

 Integrated Swagger (static mode)

 Verified Prisma Studio (localhost:5555)

 Cleaned GitGuardian findings (ignore, rebase)

Deliverable:
Working API with connected database and generated Swagger documentation.

🔐 Sprint 2 – Authentication & Basic CRUD ✅ (Completed)
🎯 Goals

Implement secure user authentication and base management endpoints.

🧩 Tasks

 Added JWT Auth

 POST /auth/register

 POST /auth/login

 GET /auth/me

 Authentication middleware (protected routes)

 Full CRUD for Users

 Full CRUD for Drivers

 Validation using Zod

 Updated Swagger

Deliverable:
Secure auth system + fully managed User/Driver endpoints.

📦 Sprint 3 – Orders, Routes & Optimization ✅ (Completed)
🎯 Goals

Implement the core logistics logic with smart routing.

🧩 Tasks

 CRUD for Orders

 CRUD for Routes & Route Stops

 Route Optimization Engine:

 Google Maps Distance Matrix

 Smart stop sequencing

 ETA calculations

 Redis caching to reduce API cost

 Rate Limiter + CORS Security

 Updated Swagger for all endpoints

Deliverable:
Powerful routing engine with optimized ETAs and safe external API usage.

⚙️ Sprint 4 – System Monitoring, Health & Logging 🚧 (In Progress)
🎯 Goals

Enhance system observability and reliability.

🧩 Tasks

 /system/health → DB + Redis + Google API connectivity

 /system/usage → API usage stats (Redis-based)

 Improved structured logging (info/warn/error)

 Persistent log storage (Pino/Winston)

 System uptime & memory usage reporting

🚚 Sprint 5 – Driver Live Tracking (Backend) ✅ (Completed)
🎯 Goals

Add real-time driver tracking and push updates to the frontend.

🧩 Tasks
Database & Schema

 Added currentLat, currentLng to Driver

 Added DriverVehicleType enum: MOTORCYCLE | CAR | VAN

 Enforced enum validation in API (Zod)

Live Tracking API

 Added endpoint:
GET /drivers/:driverId/stream → Live SSE event stream

 Added endpoint:
PATCH /drivers/:driverId/location → Driver updates location

 Broadcast location updates to all connected SSE clients

 Connection cleanup & error handling

Reliability Features

 Heartbeat → Sends ping every 30 seconds to keep SSE alive

 Auto-Cleanup → Removes closed/inactive clients every 10 minutes

 Server avoids memory leaks with controlled Maps

Deliverable:
Stable, real-time driver location tracking ready for frontend integration.

🗺 Sprint 6 – Frontend Dashboard + Live Map ⏳ (Planned)
🎯 Goals

Create a modern dashboard for admins & drivers with live map updates.

🧩 Tasks

 Initialize React app (apps/web)

 Login / Register UI

 Admin Dashboard (Users / Drivers / Orders / Routes)

 Map view with route visualization (Google Maps / Leaflet)

 Live tracking: update driver marker via SSE stream

 Display progress along route & ETA updates

🧾 Sprint 7 – Testing & Deployment ⏳ (Planned)
🎯 Goals

Prepare backend + frontend for production.

🧩 Tasks

 Unit tests (Jest / Vitest)

 Integration tests (Fastify inject)

 Dockerfile for API

 CI/CD pipeline

 Deploy API → Railway / Fly.io

 Deploy Frontend → Vercel

 Production .env setup

📈 Sprint Progress Overview
Sprint	Focus	Status
🗺️ Deli-Baba Roadmap
🚀 Sprint 1 – Infrastructure & Automation ✅ (Completed)
🎯 Goals

Set up full development environment (Backend + DB + Swagger)
and build a stable and secure API foundation.

✅ Tasks

 Installed Fastify + Prisma + Zod

 Connected MySQL & Redis via Docker Compose

 Created .env file and hid secrets from Git

 Built Postman → OpenAPI generation script

 Integrated Swagger (static mode)

 Verified Prisma Studio (localhost:5555)

 Cleaned GitGuardian findings (ignore, rebase)

Deliverable:
Working API with connected database and generated Swagger documentation.

🔐 Sprint 2 – Authentication & Basic CRUD ✅ (Completed)
🎯 Goals

Implement secure user authentication and base management endpoints.

🧩 Tasks

 Added JWT Auth

 POST /auth/register

 POST /auth/login

 GET /auth/me

 Authentication middleware (protected routes)

 Full CRUD for Users

 Full CRUD for Drivers

 Validation using Zod

 Updated Swagger

Deliverable:
Secure auth system + fully managed User/Driver endpoints.

📦 Sprint 3 – Orders, Routes & Optimization ✅ (Completed)
🎯 Goals

Implement the core logistics logic with smart routing.

🧩 Tasks

 CRUD for Orders

 CRUD for Routes & Route Stops

 Route Optimization Engine:

 Google Maps Distance Matrix

 Smart stop sequencing

 ETA calculations

 Redis caching to reduce API cost

 Rate Limiter + CORS Security

 Updated Swagger for all endpoints

Deliverable:
Powerful routing engine with optimized ETAs and safe external API usage.

⚙️ Sprint 4 – System Monitoring, Health & Logging 🚧 (In Progress)
🎯 Goals

Enhance system observability and reliability.

🧩 Tasks

 /system/health → DB + Redis + Google API connectivity

 /system/usage → API usage stats (Redis-based)

 Improved structured logging (info/warn/error)

 Persistent log storage (Pino/Winston)

 System uptime & memory usage reporting

🚚 Sprint 5 – Driver Live Tracking (Backend) ✅ (Completed)
🎯 Goals

Add real-time driver tracking and push updates to the frontend.

🧩 Tasks
Database & Schema

 Added currentLat, currentLng to Driver

 Added DriverVehicleType enum: MOTORCYCLE | CAR | VAN

 Enforced enum validation in API (Zod)

Live Tracking API

 Added endpoint:
GET /drivers/:driverId/stream → Live SSE event stream

 Added endpoint:
PATCH /drivers/:driverId/location → Driver updates location

 Broadcast location updates to all connected SSE clients

 Connection cleanup & error handling

Reliability Features

 Heartbeat → Sends ping every 30 seconds to keep SSE alive

 Auto-Cleanup → Removes closed/inactive clients every 10 minutes

 Server avoids memory leaks with controlled Maps

Deliverable:
Stable, real-time driver location tracking ready for frontend integration.

🗺 Sprint 6 – Frontend Dashboard + Live Map ⏳ (Planned)
🎯 Goals

Create a modern dashboard for admins & drivers with live map updates.

🧩 Tasks

 Initialize React app (apps/web)

 Login / Register UI

 Admin Dashboard (Users / Drivers / Orders / Routes)

 Map view with route visualization (Google Maps / Leaflet)

 Live tracking: update driver marker via SSE stream

 Display progress along route & ETA updates

🧾 Sprint 7 – Testing & Deployment ⏳ (Planned)
🎯 Goals

Prepare backend + frontend for production.

🧩 Tasks

 Unit tests (Jest / Vitest)

 Integration tests (Fastify inject)

 Dockerfile for API

 CI/CD pipeline

 Deploy API → Railway / Fly.io

 Deploy Frontend → Vercel

 Production .env setup

📈 Sprint Progress Overview
Sprint	Focus	Status
1	Infrastructure Setup	✅ Done
2	Auth + CRUD	✅ Done
3	Routing Engine	✅ Done
4	Health & Monitoring	🚧 In Progress
5	Real-time Driver Tracking	✅ Done
6	Frontend Dashboard	⏳ Planned
7	Testing & Deployment	⏳ Planned
