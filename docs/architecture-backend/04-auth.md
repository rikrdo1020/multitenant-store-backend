# Backend Authentication

## JWT Strategy

Two token types:

- **Access Token**: short-lived (15 min), contains user id, role, tenant context.
- **Refresh Token**: long-lived (7 days), stored in `RefreshToken` table for revocation.

```ts
// Access Token Payload
{
  sub: string;       // userId
  role: UserRole;    // superadmin | admin | manager
  tenantId?: string; // current active tenant (for admin tokens)
  tokenVersion: number; // incremented on password reset to revoke old access tokens
  type: "access";
  iat: number;
  exp: number;
}

// Refresh Token Payload
{
  sub: string;       // userId
  type: "refresh";
  jti: string;       // unique token id for revocation
  iat: number;
  exp: number;
}
```

## Auth Flow

### Register

```
POST /auth/register
Body: { email, password, name }
-> Validate email uniqueness
-> Hash password (bcrypt, 12 rounds)
-> Create User
-> Return { accessToken, refreshToken }
```

### Login

```
POST /auth/login
Body: { email, password }
-> Find user by email
-> Compare bcrypt hash
-> If active: generate tokens, store refresh token hash in DB
-> Return { accessToken, refreshToken, user }
```

### Refresh

```
POST /auth/refresh
Body: { refreshToken }
-> Verify JWT signature + expiry
-> Check jti exists in RefreshToken table and not revoked
-> Issue new access token (and optionally rotate refresh token)
-> Return { accessToken }
```

### Logout

```
POST /auth/logout
Headers: Authorization: Bearer {accessToken}
-> Invalidate refresh token in DB (delete record)
-> Client discards both tokens
```

## Customer Order Access

Customers are per-tenant and do not have passwords by default.

- Guest order tracking uses `GET /orders/track/:orderId?token={viewToken}` with the storefront tenant resolved from `x-tenant-id`.
- `viewToken` is generated when the order is created, returned to the app once, and stored server-side only as a hash.
- Authenticated customer/account order history uses the JWT-protected order endpoints and is scoped by tenant plus customer email/account rules.

## Role-Based Access Control (RBAC)

| Role | Scope | Permissions |
|------|-------|-------------|
| `superadmin` | Platform | Full access to all tenants and users |
| `admin` | Tenant | Full CRUD within their tenant |
| `manager` | Tenant | Read + limited write (products, orders). Cannot delete or manage members. |

Middleware `requireRole(...roles)` checks the JWT role against the route's allowed roles.
The JWT role is derived from `User.role` only for platform `superadmin`; tenant `admin` and `manager` roles are resolved from `TenantMember`.

## Password Security

- Minimum 8 characters
- Bcrypt hashing with 12 salt rounds
- Password reset via secure token (Resend email, 1-hour expiry)
- `POST /auth/forgot-password` returns the same public success response whether the email exists or not to avoid email enumeration.
- Password reset requests and reset submissions are rate-limited through the email/security guard.
- Password reset increments `User.tokenVersion`; JWT validation rejects older access tokens after the reset.
- `mustChangePassword` flag forces password change on next login

## Token Storage (Backend)

```prisma
model RefreshToken {
  id        String   @id @default(cuid())
  tokenHash String   @unique
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  expiresAt DateTime
  createdAt DateTime @default(now())
}
```

On logout: delete refresh token record.
On password change: revoke all refresh tokens for the user and increment `User.tokenVersion` so existing access tokens are rejected.

## Security Headers

All responses include:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Strict-Transport-Security` (in production)
