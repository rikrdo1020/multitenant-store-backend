# Native App — API Contracts (Backend ↔ Frontend)

> This document specifies every endpoint the backend must expose for the native app to function. It is designed to be handed off to the backend team as a contract.

---

## Conventions

### Base URL

```
/api/v1
```

### Headers

| Header | When | Value |
|--------|------|-------|
| `Authorization` | Always (if authenticated) | `Bearer {accessToken}` |
| `x-tenant-id` | All storefront requests | `{tenantSlug}` |
| `Content-Type` | POST/PUT/PATCH | `application/json` |

### Response Wrapper

Every successful response is wrapped in:

```json
{
  "success": true,
  "data": { ... },
  "meta": {          // only for paginated lists
    "page": 1,
    "pageSize": 20,
    "pageCount": 5,
    "total": 97
  }
}
```

### Error Response

```json
{
  "success": false,
  "code": "INVALID_CREDENTIALS",
  "message": "Email o contraseña incorrectos",
  "statusCode": 401,
  "details": [
    { "field": "email", "message": "Email inválido" }
  ]
}
```

### HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | OK |
| 201 | Created |
| 400 | Bad Request (validation errors) |
| 401 | Unauthorized (token missing / expired) |
| 403 | Forbidden (insufficient role) |
| 404 | Not Found |
| 409 | Conflict (duplicate slug, etc.) |
| 422 | Unprocessable Entity (business rule violation) |
| 500 | Internal Server Error |

---

## 1. Authentication

### POST `/auth/login`

**Request:**
```json
{
  "email": "user@example.com",
  "password": "secure123"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbG...",
    "refreshToken": "eyJhbG...",
    "user": {
      "documentId": "usr_001",
      "email": "user@example.com",
      "name": "Juan Pérez",
      "role": "admin",
      "phone": "+50761234567"
    }
  }
}
```

### POST `/auth/register`

**Request:**
```json
{
  "name": "Juan Pérez",
  "email": "user@example.com",
  "password": "secure123",
  "phone": "+50761234567"
}
```

**Response (201):**
Same shape as login.

### POST `/auth/refresh`

**Request:**
```json
{
  "refreshToken": "eyJhbG..."
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbG..."
  }
}
```

### POST `/auth/logout`

**Headers:** `Authorization: Bearer {token}`

**Response (200):**
```json
{
  "success": true,
  "data": null
}
```

### POST `/auth/forgot-password`

**Request:**
```json
{
  "email": "user@example.com"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": { "message": "If the email exists, password reset instructions were sent." }
}
```

The response is intentionally generic so clients cannot enumerate registered emails.

### POST `/auth/reset-password`

**Request:**
```json
{
  "token": "reset-token-from-email",
  "password": "newsecure123"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": { "message": "Contraseña actualizada" }
}
```

Password reset revokes refresh sessions and invalidates older access tokens through `tokenVersion`.

---

## 2. Tenant (Store)

### GET `/store/profile`

**Headers:** `x-tenant-id: {tenantSlug}`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "documentId": "tnt_001",
    "slug": "mi-tienda",
    "name": "Mi Tienda",
    "logo": "https://cdn.example.com/logo.png",
    "description": "La mejor tienda",
    "primaryColor": "#3b82f6",
    "currency": "USD",
    "provider": "stripe"
  }
}
```

### POST `/tenants`

**Headers:** `Authorization: Bearer {token}`

**Request:**
```json
{
  "name": "Mi Tienda",
  "slug": "mi-tienda",
  "description": "Descripción opcional"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "documentId": "tnt_001",
    "slug": "mi-tienda",
    "name": "Mi Tienda",
    "logo": null,
    "description": "Descripción opcional",
    "primaryColor": "#000000",
    "currency": "USD",
    "provider": null
  }
}
```

### PUT `/tenants/:documentId`

**Headers:** `Authorization: Bearer {token}`

**Request:**
```json
{
  "name": "Nuevo Nombre",
  "primaryColor": "#ef4444",
  "provider": "stripe"
}
```

**Response (200):** Updated tenant object.

---

## 3. Products (Storefront)

### GET `/products`

**Headers:** `x-tenant-id: {tenantSlug}`

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| `category` | string | Category slug |
| `brand` | string | Brand slug |
| `type` | string | Product type slug |
| `minPrice` | number | Min price filter |
| `maxPrice` | number | Max price filter |
| `search` | string | Full-text search |
| `sort` | string | `price_asc`, `price_desc`, `newest` |
| `page` | number | Page number (default 1) |
| `pageSize` | number | Items per page (default 20) |

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "documentId": "prod_001",
      "name": "Zapatillas Runner",
      "slug": "zapatillas-runner",
      "price": 59.99,
      "discountPrice": 49.99,
      "stock": 12,
      "images": ["https://cdn.example.com/img1.jpg"],
      "description": "...",
      "category": { "documentId": "cat_001", "slug": "calzado", "name": "Calzado" },
      "brand": { "documentId": "brd_001", "slug": "nike", "name": "Nike" },
      "options": [
        { "name": "Talla", "values": ["38", "39", "40"] }
      ],
      "isFeatured": true,
      "featuredOrder": 1
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "pageCount": 3,
    "total": 45
  }
}
```

### GET `/products/:slug`

**Headers:** `x-tenant-id: {tenantSlug}`

**Response (200):** Single product object (same shape as list item).

---

## 4. Catalog Entities (Storefront)

### GET `/categories`

**Headers:** `x-tenant-id: {tenantSlug}`

**Response (200):**
```json
{
  "success": true,
  "data": [
    { "documentId": "cat_001", "slug": "calzado", "name": "Calzado", "image": "..." }
  ]
}
```

### GET `/brands`

Same shape as categories.

### GET `/tags`

Same shape as categories.

### GET `/product-types`

```json
{
  "success": true,
  "data": [
    { "documentId": "pt_001", "name": "Físico" },
    { "documentId": "pt_002", "name": "Digital" }
  ]
}
```

### GET `/shipping-methods`

**Headers:** `x-tenant-id: {tenantSlug}`

```json
{
  "success": true,
  "data": [
    {
      "documentId": "ship_001",
      "name": "Retiro en Sucursal",
      "type": "pickup_point",
      "cost": 0,
      "locations": [
        { "documentId": "loc_001", "name": "Sucursal Central", "address": "Calle 1" }
      ]
    },
    {
      "documentId": "ship_002",
      "name": "Envío a Domicilio",
      "type": "delivery_zone",
      "cost": 5.00,
      "locations": []
    }
  ]
}
```

### GET `/combos`

**Headers:** `x-tenant-id: {tenantSlug}`

```json
{
  "success": true,
  "data": [
    {
      "documentId": "combo_001",
      "name": "2x1 en Calzado",
      "conditions": [
        { "productType": "calzado", "minQuantity": 2 }
      ],
      "discount": 50,
      "discountType": "percentage"
    }
  ]
}
```

---

## 5. Orders

### POST `/orders`

**Headers:** `x-tenant-id: {tenantSlug}`

**Request:**
```json
{
  "items": [
    {
      "documentId": "prod_001",
      "name": "Zapatillas Runner",
      "price": 49.99,
      "quantity": 2,
      "selectedOptions": { "Talla": "40" },
      "image": "https://cdn.example.com/img1.jpg",
      "stock": 12
    }
  ],
  "customerData": {
    "name": "Juan Pérez",
    "email": "juan@example.com",
    "phone": "+50761234567",
    "notes": "Dejar en portería"
  },
  "receiverData": {
    "name": "Ana Pérez",
    "phone": "+50762345678"
  },
  "shippingAddress": {
    "address": "Av. Principal 123",
    "reference": "Edificio Azul",
    "city": "Panamá"
  },
  "shippingMethodId": "ship_002",
  "shippingLocationId": null
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "documentId": "ord_001",
    "orderId": "ORD-2026-0001",
    "viewToken": "public-view-token-returned-once",
    "orderStatus": "pending",
    "items": [ /* trusted backend item snapshots */ ],
    "customerData": { /* customer snapshot */ },
    "shippingData": { /* trusted shipping snapshot */ },
    "total": 104.99,
    "createdAt": "2026-05-13T20:00:00Z"
  }
}
```

`viewToken` is returned only when the order is created. The backend stores only a hash of this token.

### GET `/orders/track/:orderId?token={viewToken}`

**Headers:** `x-tenant-id: {tenantSlug}`

**Response (200):** Public order object. `viewTokenHash` is never returned.

### GET `/orders/track/:viewToken`

**Headers:** `x-tenant-id: {tenantSlug}`

**Response (200):** Public order object. `viewTokenHash` is never returned.

### POST `/orders/track`

**Headers:** `x-tenant-id: {tenantSlug}`

**Request:**
```json
{
  "orderId": "ORD-2026-0001",
  "email": "juan@example.com"
}
```

**Response (200):** Public order object with masked customer and shipping data.

### POST `/payments/yappy/create`

**Headers:** `x-tenant-id: {tenantSlug}`

**Request:**
```json
{
  "orderId": "ORD-2026-0001",
  "viewToken": "public-view-token-returned-once",
  "amount": 104.99,
  "aliasYappy": "67891234"
}
```

**Response (200):** Yappy payment payload. The backend uses the persisted order total and validates `orderId + viewToken + tenant`.

### GET `/orders/:orderId`

**Headers:** `x-tenant-id: {tenantSlug}`

**Response (200):** Authenticated customer/admin order object.

### PUT `/orders/:orderId/status`

**Headers:** `Authorization: Bearer {token}` (admin only)

**Request:**
```json
{
  "orderStatus": "shipped",
  "trackingNumber": "TRK-123",
  "trackingCarrier": "DHL",
  "trackingUrl": "https://tracking.example/TRK-123",
  "adminNote": "Despachado desde bodega"
}
```

**Response (200):** Updated order.

---

## 6. Admin Endpoints

### GET `/admin/products`

**Headers:** `Authorization: Bearer {token}`, `x-tenant-id: {tenantSlug}`

**Query:** Same filters as storefront plus `status`, `stockAlert`.

**Response (200):** Paginated list of products.

### POST `/admin/products`

**Request:** Product creation payload (same fields as Product type, minus `documentId`).

**Response (201):** Created product.

### PUT `/admin/products/:documentId`

**Request:** Partial product update.

**Response (200):** Updated product.

### DELETE `/admin/products/:documentId`

**Response (200):** `{ success: true, data: null }`

### GET `/admin/orders`

**Headers:** `Authorization: Bearer {token}`, `x-tenant-id: {tenantSlug}`

**Query:** `status`, `from`, `to`, `page`, `pageSize`.

**Response (200):** Paginated list of orders.

---

## 7. Upload

### POST `/upload/image`

**Headers:** `Authorization: Bearer {token}`, `Content-Type: multipart/form-data`

**Body:** `multipart/form-data` with field `file`.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "url": "https://cdn.example.com/uploads/uuid.jpg"
  }
}
```

---

## 8. Dashboard (Admin)

### GET `/admin/dashboard`

**Headers:** `Authorization: Bearer {token}`, `x-tenant-id: {tenantSlug}`

**Response (200):**
```json
{
  "success": true,
  "data": {
    "todayOrders": 12,
    "weekOrders": 87,
    "monthOrders": 342,
    "todayRevenue": 1250.00,
    "weekRevenue": 8900.00,
    "monthRevenue": 34200.00,
    "lowStockAlerts": [
      { "documentId": "prod_001", "name": "Zapatillas Runner", "stock": 2 }
    ],
    "recentOrders": [
      { "documentId": "ord_001", "orderId": "ORD-2026-0001", "orderStatus": "paid", "total": 104.99, "createdAt": "2026-05-13T20:00:00Z" }
    ]
  }
}
```

---

## 9. Payment Webhooks (Backend → Provider)

These are **incoming** to the backend, not consumed by the frontend directly.

### Stripe Webhook

```
POST /webhooks/stripe
```

Backend must listen for `payment_intent.succeeded` to mark order as `paid`.

### Yappy Callback

```
GET /webhooks/yappy/callback?orderId=XXX&status=paid
```

Backend must verify token and update order status.

---

## 10. Data Models Reference

### User
```ts
interface User {
  documentId: string;
  email: string;
  name: string;
  role: 'superadmin' | 'admin' | 'manager' | 'customer';
  phone?: string;
}
```

### Tenant
```ts
interface Tenant {
  documentId: string;
  slug: string;
  name: string;
  logo?: string;
  description?: string;
  primaryColor?: string;
  currency?: string;
  provider?: 'stripe' | 'yappy';
}
```

### Product
```ts
interface Product {
  documentId: string;
  name: string;
  slug: string;
  price: number;
  discountPrice?: number;
  stock: number;
  images: string[];
  description?: string;
  category?: Category;
  brand?: Brand;
  options?: ProductOption[];
  isFeatured?: boolean;
  featuredOrder?: number;
}
```

### Order
```ts
interface Order {
  documentId: string;
  orderId: string;
  orderStatus: 'pending' | 'paid' | 'processing' | 'ready' | 'shipped' | 'delivered' | 'failed' | 'cancelled' | 'rejected' | 'expired';
  items: CartItem[];
  customerData: CustomerFormData;
  shippingMethod: ShippingMethod;
  shippingAddress?: ShippingAddressData;
  pricingBreakdown?: { subtotal: number; discount: number; shippingCost: number; tax: number; total: number };
  trackingNumber?: string;
  trackingCarrier?: string;
  trackingUrl?: string;
  total: number;
  createdAt: string;
}
```

---

## 11. Frontend-Backend Shared Code

The following files are designed to be shared between frontend and backend to guarantee consistency:

| File | Location (frontend) | What to share |
|------|---------------------|---------------|
| Pricing engine | `lib/pricing.ts` | Copy to backend and run same unit tests |
| Validators | `lib/validators.ts` | Reuse Zod schemas on backend |
| Types | `types/index.ts` | Use as source of truth for both codebases |
