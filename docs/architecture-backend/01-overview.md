# MultiTenant Store — Backend System Overview

## What It Is

REST API backend for a multi-tenant e-commerce platform. Built with Node.js + Express + TypeScript. Serves both the React Native mobile app and the web storefront.

Each user (store owner) can create one or more stores (tenants). Every tenant is completely isolated: products, orders, customers, and settings belong to a single tenant.

## Repository Layout

```
backend/
├── src/
│   ├── config/             # Env validation, app config
│   ├── controllers/        # Route handlers (thin, delegate to services)
│   ├── services/           # Business logic, DB transactions
│   ├── repositories/       # Prisma queries, raw DB access
│   ├── routes/             # Express route definitions
│   ├── middleware/         # Auth, tenant resolution, error handler, validation
│   ├── models/             # Prisma schema + generated types
│   ├── types/              # Domain TypeScript interfaces
│   ├── utils/              # Helpers, serializers, pricing engine
│   ├── lib/                # External clients (Prisma, Cloudinary, Resend)
│   └── index.ts            # App entry point
├── prisma/
│   ├── schema.prisma       # DB schema
│   └── seed.ts             # Seed script
├── tests/                  # Integration + unit tests
└── docs/                   # This documentation
```

## Layer Architecture

```
PRESENTATION
  Routes (URL mapping + middleware chain)
  Controllers (parse req, call service, send res)
        |
BUSINESS LOGIC
  Services (business rules, transactions, orchestration)
  Utils (pricing engine, validators)
        |
DATA ACCESS
  Repositories (Prisma queries, raw SQL when needed)
        |
INFRASTRUCTURE
  PostgreSQL via Prisma ORM
  Cloudinary (images)
  Resend (emails)
  Payment Providers (webhooks)
```

Rules:
- Controllers are thin. No business logic, no direct Prisma calls.
- Services contain all business rules. One service per domain entity.
- Repositories abstract Prisma. Raw SQL only when Prisma can't handle it.
- Middleware handles cross-cutting concerns: auth, tenant isolation, validation, error handling.

## Key Architectural Decisions

| Decision | Why |
|----------|-----|
| Express + TypeScript (not Next.js) | Clean separation from frontend. Pure API, no rendering. |
| PostgreSQL + Prisma | Type-safe, versioned migrations, excellent relational modeling. |
| Multi-tenant via `tenantId` FK | Simple, performant, easy to backup per tenant. |
| JWT access + refresh tokens | Stateless auth, works on mobile and web. |
| Pluggable payment providers | Each tenant can configure its own gateway (Stripe, Yappy, etc.). |
| Cloudinary for images | CDN, transforms, no server storage. |
| Resend for emails | Transactional emails per tenant (custom from address). |
| Repository pattern | Testable, swappable data layer. |

## Tech Stack

| Layer | Tech | Version |
|-------|------|---------|
| Runtime | Node.js | 20 LTS |
| Framework | Express | 4.x |
| Language | TypeScript | 5.x |
| ORM | Prisma | 6.x |
| DB Driver | pg + @prisma/adapter-pg | latest |
| Auth | jsonwebtoken + bcryptjs | latest |
| Validation | Zod | 3.x |
| Images | Cloudinary SDK | latest |
| Email | Resend | latest |
| Testing | Vitest + supertest | latest |
| Lint | ESLint + Prettier | latest |
