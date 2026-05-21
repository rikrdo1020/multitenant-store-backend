# Backend Database Schema

PostgreSQL via Prisma 6 with `@prisma/adapter-pg`.

## Enums

```prisma
enum ProductStatus { draft | published | archived }
enum ShippingType  { pickup_point | delivery_zone | third_party }
enum OrderStatus   { pending | paid | cancelled | failed | rejected | expired }
enum UserRole      { superadmin | admin | manager }
enum TenantStatus  { active | suspended | inactive }
enum PaymentProvider { stripe | yappy | paypal | mercadopago }
```

## Models

### User (Platform Users)
```prisma
id            String    @id @default(cuid())
email         String    @unique
passwordHash  String    // bcrypt
name          String?
phone         String?
role          UserRole  @default(manager)
isActive      Boolean   @default(true)
createdAt     DateTime  @default(now())
updatedAt     DateTime  @updatedAt

// Relations
tenants       TenantMember[]
```
> Users are platform-level accounts. A user can own or manage multiple tenants.
> `role=superadmin` is platform-wide. Tenant admin/manager permissions are still resolved through `TenantMember`.

### Tenant (Store)
```prisma
id            String       @id @default(cuid())
slug          String       @unique           // Subdomain / store identifier
name          String
status        TenantStatus @default(active)
logo          String?
description   String?
primaryColor  String?      @default("#000000")
seoTitle      String?
seoDescription String?
provider      PaymentProvider @default(stripe)
providerConfig Json?       // API keys, secrets per provider (encrypted)
customDomain  String?      @unique

// Relations
members       TenantMember[]
products      Product[]
categories    Category[]
brands        Brand[]
tags          Tag[]
productTypes  ProductType[]
orders        Order[]
customers     Customer[]
shippingMethods ShippingMethod[]
combos        Combo[]
settings      TenantSetting?

ownerId       String
owner         User         @relation(fields: [ownerId], references: [id])

createdAt     DateTime     @default(now())
updatedAt     DateTime     @updatedAt
```
> `slug` is used for tenant resolution in the API (`x-tenant-id` header or subdomain).
> `providerConfig` stores encrypted credentials for the configured payment gateway.

### TenantMember (User <-> Tenant relation with role)
```prisma
id        String   @id @default(cuid())
userId    String
user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
tenantId  String
tenant    Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
role      UserRole @default(admin)
createdAt DateTime @default(now())

@@unique([userId, tenantId])
```

### Customer (Per-tenant shoppers)
```prisma
id          String   @id @default(cuid())
name        String
email       String
phone       String
address     String?
city        String?
country     String?  @default("PA")
notes       String?
tenantId    String
tenant      Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
orders      Order[]
createdAt   DateTime @default(now())
updatedAt   DateTime @updatedAt

@@unique([email, tenantId])
```
> Customers are scoped to a tenant. The same email can exist across different tenants.

### Category
```prisma
id          String    @id @default(cuid())
name        String
slug        String
description String?
images      String[]  @default([])
tenantId    String
tenant      Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
products    Product[]
createdAt   DateTime  @default(now())
updatedAt   DateTime  @updatedAt

@@unique([slug, tenantId])
```

### Brand
```prisma
id          String    @id @default(cuid())
name        String
slug        String
logo        String?
website     String?
description String?
tenantId    String
tenant      Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
products    Product[]
createdAt   DateTime  @default(now())
updatedAt   DateTime  @updatedAt

@@unique([slug, tenantId])
```

### Tag
```prisma
id       String    @id @default(cuid())
name     String
slug     String
tenantId String
tenant   Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
products Product[] @relation("ProductTags")
createdAt DateTime @default(now())
updatedAt DateTime @updatedAt

@@unique([slug, tenantId])
```

### ProductType
```prisma
id          String   @id @default(cuid())
name        String
slug        String
description String?
tenantId    String
tenant      Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
createdAt   DateTime @default(now())
updatedAt   DateTime @updatedAt

@@unique([slug, tenantId])
```
> Types are dynamic per tenant — managed from the admin panel.

### Product
```prisma
id             String        @id @default(cuid())
name           String
slug           String
description    Json?         // DescriptionBlock[]
price          Decimal       @db.Decimal(10,2)
discountPrice  Decimal?      @db.Decimal(10,2)
dku            String        // SKU-like unique code
stock          Int           @default(0)
productStatus  ProductStatus @default(draft)
type           String?       // matches ProductType.slug
volume         String?
options        Json?         // ProductOption[] — variant options
images         String[]      @default([])
isFeatured     Boolean       @default(false)
featuredOrder  Int           @default(9999)
seoTitle       String?
seoDescription String?
categoryId     String?
category       Category?     @relation(fields: [categoryId], references: [id])
brandId        String?
brand          Brand?        @relation(fields: [brandId], references: [id])
tags           Tag[]         @relation("ProductTags")
tenantId       String
tenant         Tenant        @relation(fields: [tenantId], references: [id], onDelete: Cascade)
createdAt      DateTime      @default(now())
updatedAt      DateTime      @updatedAt

@@unique([slug, tenantId])
@@unique([dku, tenantId])
```

### ShippingMethod
```prisma
id              String             @id @default(cuid())
name            String
type            ShippingType
basePrice       Decimal?           @db.Decimal(10,2)
requiresDetails Boolean            @default(false)
disclaimer      String?
tenantId        String
tenant          Tenant             @relation(fields: [tenantId], references: [id], onDelete: Cascade)
logistics       ShippingLocation[]
createdAt       DateTime           @default(now())
updatedAt       DateTime           @updatedAt
```

### ShippingLocation
```prisma
id               String         @id @default(cuid())
key              String
label            String
extraPrice       Decimal?       @db.Decimal(10,2)
shippingMethodId String
shippingMethod   ShippingMethod @relation(fields: [shippingMethodId], references: [id], onDelete: Cascade)
createdAt        DateTime       @default(now())
updatedAt        DateTime       @updatedAt

@@unique([key, shippingMethodId])
```

### Order
```prisma
id                 String      @id @default(cuid())
orderId            String      @unique    // "ORD-{timestamp}"
total              Decimal     @db.Decimal(10,2)
orderStatus        OrderStatus @default(pending)
transactionId      String?
shippingCost       Decimal     @db.Decimal(10,2)
customerData       Json        // Customer snapshot
shippingData       Json        // varies by ShippingType
items              Json        // CartItem[] snapshot
shippingMethodId   String?
shippingLocationId String?
paymentMethod      String      @default("stripe")
confirmationNumber String?
dispatched         Boolean     @default(false)
tenantId           String
tenant             Tenant      @relation(fields: [tenantId], references: [id], onDelete: Cascade)
customerId         String?
customer           Customer?   @relation(fields: [customerId], references: [id])
createdAt          DateTime    @default(now())
updatedAt          DateTime    @updatedAt
```

### Combo
```prisma
id        String   @id @default(cuid())
name      String
price     Decimal  @db.Decimal(10,2)
rules     Json     // [{ productType: string, quantity: number }]
isActive  Boolean  @default(true)
tenantId  String
tenant    Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
createdAt DateTime @default(now())
updatedAt DateTime @updatedAt
```
> Combos drive the pricing engine. Active combos are fetched during order creation.

### TenantSetting
```prisma
id                String   @id @default(cuid())
lowStockThreshold Int      @default(5)
currency          String   @default("USD")
taxRate           Decimal  @default(0) @db.Decimal(5,2)
emailFrom         String?
emailFromName     String?
tenantId          String   @unique
tenant            Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
updatedAt         DateTime @updatedAt
```

## Tenant Isolation

Every query must include `tenantId` filtering. The repository layer enforces this automatically via a `withTenant` helper:

```ts
// repositories/base.ts
export function withTenant(tenantId: string) {
  return { tenantId };
}

// Usage in repositories
prisma.product.findMany({ where: { ...withTenant(tenantId), productStatus: 'published' } })
```

## Serializers (`src/utils/serializers.ts`)

All Prisma responses are serialized before leaving the service layer:
- `Decimal` → `number`
- `Date` → ISO string
- `id` aliased to `documentId` for frontend compatibility

## Seed Script (`prisma/seed.ts`)

Run via `npx prisma db seed`. Creates:
- A default `User` (superadmin)
- A sample `Tenant`
- Categories, Brands, Tags, ProductTypes, Products scoped to the sample tenant
- Sample ShippingMethods
