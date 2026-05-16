# MultiTenant Store — Backend

REST API for a multi-tenant e-commerce platform. Each store owner can create one or more tenants. Products, orders, customers, and settings are fully isolated per tenant.

## Stack

| Layer | Tech |
|---|---|
| Framework | NestJS 10 |
| Language | TypeScript 5 |
| ORM | Prisma 6 |
| Database | PostgreSQL |
| Auth | JWT (access 15min + refresh 7d) |
| Images | Cloudinary |
| Email | Resend |
| Logger | Winston |
| Tests | Vitest |

## Prerequisites

- Node.js 20 LTS
- PostgreSQL running locally (or remote URL)
- Cloudinary account
- Resend account

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy env file and fill in your values
cp .env.example .env

# 3. Run database migrations
npx prisma migrate dev

# 4. Generate Prisma client
npx prisma generate

# 5. Seed initial data (superadmin + sample tenant)
npm run prisma:seed

# 6. Start development server
npm run start:dev
```

Server starts at `http://localhost:3000`. All routes are prefixed with `/api/v1`.

## Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_ACCESS_SECRET` | Secret for signing access tokens |
| `JWT_REFRESH_SECRET` | Secret for signing refresh tokens |
| `JWT_ACCESS_EXPIRES_IN` | Access token TTL (default: `15m`) |
| `JWT_REFRESH_EXPIRES_IN` | Refresh token TTL (default: `7d`) |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret |
| `RESEND_API_KEY` | Resend API key |
| `RESEND_FROM_EMAIL` | Default verified sender email for transactional emails |
| `RESEND_FROM_NAME` | Default sender display name for transactional emails |
| `FRONTEND_URL` | Frontend URL for CORS |
| `PASSWORD_RESET_URL` | Native deep link base for password reset emails, e.g. `multitenant://reset-password` |
| `TEAM_INVITE_URL` | Native deep link base for team invitation emails, e.g. `multitenant://invite` |
| `SEED_SUPERADMIN_EMAIL` | Superadmin email created by seed |
| `SEED_SUPERADMIN_PASSWORD` | Superadmin password created by seed |

## Scripts

```bash
npm run start:dev       # Development with hot-reload
npm run start:prod      # Production (requires build)
npm run build           # Compile TypeScript

npm run test            # Run tests (Vitest)
npm run test:watch      # Watch mode
npm run test:cov        # Coverage report

npm run prisma:migrate  # Run migrations (dev)
npm run prisma:generate # Regenerate Prisma client
npm run prisma:seed     # Seed initial data
npm run prisma:studio   # Open Prisma Studio UI

npm run lint            # ESLint
npm run format          # Prettier
```

## Tenant Resolution

Every request must identify the tenant via one of:

1. **Header** (preferred): `x-tenant-id: {tenantSlug}`
2. **Subdomain**: `{tenantSlug}.api.yourdomain.com`
3. **Query param**: `?tenant={tenantSlug}`

Routes under `/auth/*` and `/superadmin/*` do not require tenant resolution.

## Authentication

```
POST /api/v1/auth/register     # Create account
POST /api/v1/auth/login        # Login → { accessToken, refreshToken }
POST /api/v1/auth/refresh      # Rotate access token
POST /api/v1/auth/logout       # Revoke refresh token
POST /api/v1/auth/forgot-password
POST /api/v1/auth/reset-password
```

Include the access token in subsequent requests:

```
Authorization: Bearer <accessToken>
```

## Role-Based Access Control

| Role | Scope |
|---|---|
| `superadmin` | Full platform access |
| `admin` | Full CRUD within their tenant |
| `manager` | Read + limited write (no delete, no member management) |

## Response Format

```jsonc
// Success
{ "success": true, "data": { ... } }

// Paginated
{ "success": true, "data": [...], "meta": { "page": 1, "pageSize": 20, "total": 100, "totalPages": 5 } }

// Error
{ "success": false, "error": { "code": "NOT_FOUND", "message": "Product not found", "details": [] } }
```

## Project Structure

```
src/
├── main.ts                        # Bootstrap
├── app.module.ts                  # Root module
├── prisma/                        # PrismaService (global)
├── config/configuration.ts        # Zod env validation
├── common/
│   ├── guards/                    # JwtAuthGuard, RolesGuard
│   ├── middleware/tenant.middleware.ts
│   ├── filters/http-exception.filter.ts
│   ├── interceptors/transform.interceptor.ts
│   ├── decorators/                # @CurrentUser, @CurrentTenant, @Roles, @Public
│   └── utils/serializer.ts
├── lib/
│   ├── cloudinary/
│   ├── resend/
│   └── logger/
├── modules/
│   ├── auth/
│   ├── tenant/
│   ├── product/
│   ├── category/
│   ├── brand/
│   ├── tag/
│   ├── product-type/
│   ├── order/
│   ├── customer/
│   ├── shipping/
│   ├── combo/
│   ├── settings/
│   ├── member/
│   ├── superadmin/
│   ├── upload/
│   └── webhook/
└── types/express.d.ts
```

## Architecture

```
Controller  →  (thin, parse req + send res)
Service     →  (business logic, transactions)
Repository  →  (Prisma queries only)
```

- Controllers never call Prisma directly.
- Services own all business rules.
- Repositories abstract the data layer — one per domain entity.
- `tenantId` is injected at the service/repository layer, never trusted from request body.

## Database Migrations

```bash
# Create a new migration after changing prisma/schema.prisma
npx prisma migrate dev --name describe_your_change

# Apply migrations in production
npx prisma migrate deploy
```
