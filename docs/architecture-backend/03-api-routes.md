# Backend API Routes

Base path: `/api/v1`

All routes expect `Content-Type: application/json` unless uploading files.

## Tenant Resolution

The API resolves the current tenant via **one** of:
1. Header: `x-tenant-id: {tenantSlug}` (primary, used by native app)
2. Subdomain: `{tenantSlug}.api.domain.com` (optional, for custom domains)
3. Query param: `?tenant={tenantSlug}` (fallback for web)

Middleware `resolveTenant()` injects `req.tenant` (full Tenant object) into the request. All subsequent handlers use `req.tenant.id` for data isolation.

## Public Routes (No Auth)

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/health` | Health check |
| POST | `/auth/register` | Register new user |
| POST | `/auth/login` | Login, returns tokens |
| POST | `/auth/refresh` | Refresh access token |
| POST | `/auth/forgot-password` | Send password reset email |
| POST | `/auth/reset-password` | Reset password with token |

## Storefront Routes (Tenant-scoped, optional customer auth)

Customer auth is optional for browsing. Required for order history.

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/store/profile` | - | Public tenant info (name, logo, colors) |
| GET | `/products` | - | Paginated product list with filters |
| GET | `/products/:slug` | - | Product detail |
| GET | `/categories` | - | List categories |
| GET | `/categories/:slug` | - | Products by category |
| GET | `/brands` | - | List brands |
| GET | `/brands/:slug` | - | Products by brand |
| GET | `/tags` | - | List tags |
| GET | `/shipping-methods` | - | Available shipping methods |
| POST | `/customers` | - | Create customer (guest checkout) |
| POST | `/orders` | - | Create order + init payment |
| GET | `/orders/track/:orderId?token={viewToken}` | - | Public guest order tracking with order ID + view token |
| GET | `/orders/track/:viewToken` | - | Public guest order tracking with view token only |
| POST | `/orders/track` | - | Public guest order tracking with `{ email, orderId }` |
| GET | `/orders/:orderId/status` | - | Poll order payment status |
| POST | `/payments/yappy/create` | - | Create Yappy payment for `orderId + viewToken` |
| POST | `/webhooks/:provider` | - | Payment provider webhooks |

## Customer Auth Routes (JWT `customer`)

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/customers/me` | Get current customer |
| GET | `/customers/me/orders` | Order history |

## Admin Routes (JWT `admin` or `manager`, tenant-scoped)

| Method | Route | Min Role | Description |
|--------|-------|----------|-------------|
| GET | `/admin/dashboard` | admin | Stats + charts data |
| GET | `/admin/products` | admin | Product list |
| POST | `/admin/products` | admin | Create product |
| GET | `/admin/products/:id` | admin | Product detail |
| PUT | `/admin/products/:id` | admin | Update product |
| DELETE | `/admin/products/:id` | admin | Delete product |
| GET | `/admin/categories` | admin | Category list |
| POST | `/admin/categories` | admin | Create category |
| PUT | `/admin/categories/:id` | admin | Update category |
| DELETE | `/admin/categories/:id` | admin | Delete category |
| GET | `/admin/brands` | admin | Brand list |
| POST | `/admin/brands` | admin | Create brand |
| PUT | `/admin/brands/:id` | admin | Update brand |
| DELETE | `/admin/brands/:id` | admin | Delete brand |
| GET | `/admin/tags` | admin | Tag list |
| POST | `/admin/tags` | admin | Create tag |
| DELETE | `/admin/tags/:id` | admin | Delete tag |
| GET | `/admin/product-types` | admin | Product types list |
| POST | `/admin/product-types` | admin | Create product type |
| DELETE | `/admin/product-types/:id` | admin | Delete product type |
| GET | `/admin/orders` | admin | Order list |
| GET | `/admin/orders/:id` | admin | Order detail |
| PUT | `/admin/orders/:id/status` | admin | Update order status, tracking fields, and admin note |
| PUT | `/admin/orders/:id/dispatch` | admin | Toggle dispatched |
| GET | `/admin/shipping-methods` | admin | Shipping methods |
| POST | `/admin/shipping-methods` | admin | Create shipping method |
| PUT | `/admin/shipping-methods/:id` | admin | Update shipping method |
| DELETE | `/admin/shipping-methods/:id` | admin | Delete shipping method |
| GET | `/admin/combos` | admin | Combo list |
| POST | `/admin/combos` | admin | Create combo |
| PUT | `/admin/combos/:id` | admin | Update combo |
| DELETE | `/admin/combos/:id` | admin | Delete combo |
| GET | `/admin/customers` | admin | Customer list |
| GET | `/admin/settings` | admin | Tenant settings |
| PUT | `/admin/settings` | admin | Update tenant settings |
| GET | `/admin/members` | admin | Tenant members |
| POST | `/admin/members` | admin | Invite member |
| PUT | `/admin/members/:id` | admin | Update member role |
| DELETE | `/admin/members/:id` | admin | Remove member |

## Superadmin Routes (JWT `superadmin`, platform-wide)

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/superadmin/tenants` | List all tenants |
| GET | `/superadmin/tenants/:id` | Tenant detail |
| PUT | `/superadmin/tenants/:id/status` | Activate/suspend tenant |
| GET | `/superadmin/users` | List all platform users |

## Upload Routes

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/upload/image` | admin | Upload image to Cloudinary, returns URL |
| DELETE | `/upload/image` | admin | Delete image from Cloudinary by publicId |

## Middleware Chain

```
resolveTenant → authenticate (optional) → authorize (role check) → validateBody (Zod) → controller
```

| Middleware | Purpose |
|-----------|---------|
| `resolveTenant` | Extracts tenant from header/subdomain/query. Returns 400 if missing. |
| `authenticate` | Validates JWT access token. Injects `req.user`. Returns 401 if invalid. |
| `requireAuth` | Alias for `authenticate` with mandatory enforcement. |
| `requireRole(...roles)` | Checks `req.user.role` against allowed roles. Returns 403. |
| `validateBody(schema)` | Zod validation. Returns 422 with field errors. |
| `errorHandler` | Catches all errors. Returns consistent `{ success: false, error: { code, message } }`. |

## Response Format

```json
// Success
{
  "success": true,
  "data": { ... }
}

// Paginated
{
  "success": true,
  "data": [ ... ],
  "meta": { "page": 1, "pageSize": 20, "total": 100, "totalPages": 5 }
}

// Error
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input data",
    "details": [ { "field": "email", "message": "Invalid email" } ]
  }
}
```
