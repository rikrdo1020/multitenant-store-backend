# Backend Business Rules

## Tenant (BT-01)

- `slug` must be globally unique. Used as subdomain or API header.
- `status`: `active` = fully operational, `suspended` = read-only, `inactive` = hidden.
- Each tenant has exactly one `owner` (User). Owner cannot be removed.
- `customDomain` is optional and globally unique.
- `providerConfig` must be encrypted at rest (AES-256) before storage.
- Deleting a tenant cascades to all related data.

## Products (BT-02)

- `productStatus`: `published` = visible in storefront, `draft` = hidden, `archived` = hidden.
- `type`: free string matching a `ProductType.slug` within the same tenant.
- `discountPrice`: optional. If set, used as sale price. Discount % = `((price - discountPrice) / price) * 100`.
- `stock = 0` → product shows as out of stock, cannot be added to cart.
- `isFeatured = true` → shown on storefront homepage, ordered by `featuredOrder ASC`.
- `dku`: unique per tenant (not globally unique).
- Images: array of Cloudinary URLs.
- `options`: JSON array of `ProductOption[]` for variants (e.g., `"Presentacion": ["60ml", "120ml"]`).
- Product slugs are unique per tenant. Auto-generated from name if not provided.

## Cart & Pricing (BT-03)

Cart is client-side only (Native app / Web). The backend validates cart contents on order creation.

- Item uniqueness key: `documentId` OR `documentId:JSON(selectedOptions)` if variants.
- Price used: `discountPrice ?? price`.
- Backend recalculates pricing on order creation using `calculateCartPricing(items, activeCombos)`.
- Stock validation is server-side: rejects order if any item exceeds available stock (`stock - reservedStock`).

## Combos (BT-04)

- Combos are tenant-scoped DB records with `rules: [{ productType, quantity }]`.
- Engine runs `calculateCartPricing(items, activeCombos)` to find minimum total.
- Combo price replaces individual product prices for matched items.
- Items without `type` are excluded from combo calculations.
- Max 5 applications per combo in search tree.
- Only active combos (`isActive = true`) are considered.

## Checkout (BT-05)

Prerequisites to place order:
1. Cart not empty
2. Valid customer data
3. Valid shipping method selected

Customer data required:
- `name` (min 3 chars)
- `email` (valid format)
- `phone` (min 7 chars)
- `notes` (optional)

Receiver data (only when `shippingMethod.requiresDetails = true`):
- `receiverName`, `receiverCedula`, `receiverPhone`

Order creation flow:
1. Validate all items exist and have sufficient stock (tenant-scoped)
2. Fetch active combos, run `calculateCartPricing`
3. Fetch shipping method + location, compute `shippingCost = basePrice + extraPrice`
4. Generate `orderId = "ORD-{Date.now()}"`
5. Create `Customer` record if email not found in tenant
6. Create `Order` with status `pending`
7. Reserve stock by incrementing `Product.reservedStock` in the same transaction
8. Send non-blocking transactional emails: customer order-created email and store/admin new-order notification
9. Initialize payment with configured provider
10. Return order + payment credentials to client

Stock lifecycle:
- `pending` orders hold stock in `reservedStock`.
- `paid`, `processing`, `ready`, `shipped`, and `delivered` consume stock and release the reservation.
- `cancelled`, `failed`, `rejected`, and `expired` release or restore stock depending on the previous state.
- Pending reservations older than 15 minutes expire automatically.

Transactional email failures must be observable in logs/email delivery records, but they must not roll back order creation, payment confirmation, or webhook status updates.

## Shipping (BT-06)

Types:
- `pickup_point`: customer picks up at location
- `delivery_zone`: delivery to zone (address required)
- `third_party`: third-party courier (address required)

Cost = `basePrice + extraPrice` (of selected location). Either can be null (= free / pay at pickup).

`shippingData` JSON structure per type:
```ts
// pickup_point
{ method: { id, name, type }, location: { id, key, label } }

// delivery_zone / third_party
{ method: { id, name, type }, location: { id, key, label }, address: string, reference?: string }
```

## Catalog & Filters (BT-07)

All catalog queries are scoped to `tenantId`.

Filters (all optional, combined with AND):
- `categorySlug`, `brandSlug`, `type`
- `minPrice`, `maxPrice`
- `isFeatured`
- `search` (case-insensitive partial match on name, description)

Sort:
- Default: `featuredOrder ASC, createdAt DESC`
- `price:asc`, `price:desc`, `createdAt:desc`, `name:asc`

Pagination: server-side via Prisma `skip`/`take`.

## Admin (BT-08)

- Auth: JWT access token in `Authorization: Bearer` header.
- Roles: `superadmin` (platform), `admin` (tenant full), `manager` (tenant limited).
- `manager` cannot: delete products/categories, manage tenant members, change settings.
- Dashboard stats: total orders, revenue, top products — all scoped to tenant.
- `TenantSetting.lowStockThreshold`: global per-tenant setting for low stock warnings.

## Currencies & Taxes

- Default currency: USD ($). Configurable per tenant in `TenantSetting.currency`.
- Prices stored as `Decimal(10,2)`, handled as `number` in TypeScript.
- Tax rate configurable per tenant (`TenantSetting.taxRate`). Default 0.
- Discounts/coupons: no system yet. Always 0.
