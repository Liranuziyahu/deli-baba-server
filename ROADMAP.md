---

# 🗺️ Deli-Baba Roadmap

---

## 🚀 Sprint 1 – Infrastructure & Automation ✅ (Completed)

### 🎯 Goals

Set up full development environment (Backend + DB + Swagger)
and build a stable and secure API foundation.

### ✅ Tasks

* [x] Installed **Fastify + Prisma + Zod**
* [x] Connected **MySQL & Redis** via Docker Compose
* [x] Created `.env` file and hid secrets from Git
* [x] Built **Postman → OpenAPI** generation script
* [x] Integrated **Swagger (static mode)**
* [x] Verified **Prisma Studio (`localhost:5555`)**
* [x] Cleaned GitGuardian findings (ignore, rebase)

**Deliverable:**
Working API with connected database and generated Swagger documentation.

---

## 🔐 Sprint 2 – Authentication & Basic CRUD ✅ (Completed)

### 🎯 Goals

Implement secure user authentication and base management endpoints.

### 🧩 Tasks

* [x] Added **JWT Auth**

  * [x] `POST /auth/register`
  * [x] `POST /auth/login`
  * [x] `GET /auth/me`
* [x] Created authentication middleware for protected routes
* [x] Full CRUD for **Users**
* [x] Full CRUD for **Drivers**
* [x] Validation with **Zod**
* [x] Updated **Swagger** documentation

**Deliverable:**
Secure authentication + user and driver management via API & Swagger.

---

## 📦 Sprint 3 – Orders, Routes & Optimization ✅ (Completed)

### 🎯 Goals

Implement the core logistics logic with smart routing.

### 🧩 Tasks

* [x] CRUD for **Orders**
* [x] Full management for **Routes** and **Stops**
* [x] **Route Optimization Service**

  * [x] Google Maps Distance Matrix integration
  * [x] Smart order sequencing based on driver start location
  * [x] ETA calculation for each stop
  * [x] Redis caching for distances
* [x] Added **Rate Limiter + CORS Protection**
* [x] Updated Swagger for all endpoints

**Deliverable:**
Optimized, production-grade routing engine with distance & ETA tracking.

---

## ⚙️ Sprint 4 – System Monitoring & Health 🚧 (In Progress)

### 🎯 Goals

Add observability, performance monitoring, and system reliability tools.

### 🧩 Tasks

* [ ] Add `/system/health` endpoint
  → Returns DB, Redis, and Google API connection status
* [x] Add `/system/usage` endpoint
  → Returns API usage stats from Redis
* [x] Improved internal logging (`app.log.info`, `warn`, `error`)
* [ ] Add **Winston/Pino** transport for persistent logs
* [ ] Include uptime, memory usage, and server version info

**Deliverable:**
Production-grade monitoring layer with health & analytics endpoints.

---

## 🚚 Sprint 5 – Real-Time Driver Tracking (Backend) ✅ (Completed)

### 🎯 Goals

Implement real-time live tracking for drivers, enabling the frontend to show movement on map.

### 🧩 Tasks

* [x] Added `currentLat` & `currentLng` fields to **Driver** model
* [x] Added `DriverVehicleType` enum (MOTORCYCLE, CAR, VAN)
* [x] `PATCH /drivers/:driverId/location` — update driver’s live location
* [x] `GET /drivers/:driverId/stream` — SSE live location stream
* [x] Implemented SSE connection manager
* [x] Added **Heartbeat (30s)** to keep connections alive
* [x] Added **Auto-cleanup (10 min)** for empty SSE groups
* [x] Added driver existence validation for SSE stream
* [x] Updated Swagger documentation

**Deliverable:**
Full backend support for live movement tracking with SSE broadcasting.

---

## 🗺 Sprint 5 – Frontend Dashboard + Map ⏳ (Planned)

### 🎯 Goals

Develop a modern dashboard for admins and drivers with live map visualization.

### 🧩 Tasks

* [ ] Initialize `apps/web` (React + Tailwind)
* [ ] Build Login / Register pages
* [ ] Create Dashboard with statistics (Users, Orders, Routes)
* [ ] Integrate API via Axios or React Query
* [ ] Display delivery routes on **Google Maps / Leaflet**
* [ ] Add live route tracking (real-time driver status)

**Deliverable:**
Fully functional dashboard for managers & drivers with live route visualization.

---

## 🧾 Sprint 6 – Testing & Deployment ⏳ (Planned)

### 🎯 Goals

Stabilize and prepare the full system for production deployment.

### 🧩 Tasks

* [ ] Unit tests (Jest / Vitest)
* [ ] Integration tests (Fastify inject)
* [ ] Dockerfile for API build
* [ ] CI/CD pipeline for automatic deployments
* [ ] Deploy **API** → Railway / Fly.io / Render
* [ ] Deploy **Frontend** → Vercel / Netlify
* [ ] Secure `.env.production` configuration

**Deliverable:**
Production-ready, tested, and deployed Deli-Baba system.

---

## 📈 Sprint Progress Overview

| Sprint | Focus                          |     Status     |
| :----: | :----------------------------- | :------------: |
|    1   | Infrastructure & DB Setup      |     ✅ Done     |
|    2   | Auth + CRUD                    |     ✅ Done     |
|    3   | Route Optimization             |     ✅ Done     |
|    4   | Health & Monitoring            | 🚧 In Progress |
|    5   | Driver Live Tracking (Backend) |     ✅ Done     |
|    5   | Frontend Dashboard             |    ⏳ Planned   |
|    6   | Testing & Deployment           |    ⏳ Planned   |

---

![Last Updated](https://img.shields.io/github/last-commit/Liranuziyahu/deli-baba-server?label=Last%20Updated)

---
