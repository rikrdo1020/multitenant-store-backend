# Backend Environment Variables & Infrastructure

## Required Variables

```env
# Server
NODE_ENV=development                  # development | production
PORT=3001                             # API server port
API_URL=http://localhost:3001         # Public API URL
FRONTEND_URL=http://localhost:8081    # Native app / web origin (CORS)

# Database
DATABASE_URL=postgresql://user:password@host:5432/multitenant_store

# JWT
JWT_ACCESS_SECRET=                    # Min 32 chars random string
JWT_REFRESH_SECRET=                   # Min 32 chars random string
JWT_ACCESS_EXPIRY=15m                 # Access token TTL
JWT_REFRESH_EXPIRY=7d                 # Refresh token TTL

# Encryption (for providerConfig)
ENCRYPTION_KEY=                       # 32-byte hex string for AES-256

# Payment Providers (configure based on enabled providers)
# Stripe
STRIPE_SECRET_KEY=                    # sk_test_... or sk_live_...
STRIPE_WEBHOOK_SECRET=                # whsec_...

# Yappy (when implemented)
YAPPY_MERCHANT_ID=
YAPPY_URL_DOMAIN=
YAPPY_SECRET_KEY=
YAPPY_API_URL=

# Cloudinary
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

# Email (Resend)
RESEND_API_KEY=
RESEND_FROM_EMAIL=                    # e.g. noreply@multitenant.app
RESEND_FROM_NAME=                     # e.g. MultiTenant Store
MOCK_EMAIL=false                      # true = log email payloads without calling Resend
ORDER_TRACKING_URL=multitenant://track # Base link for order tracking emails
EMAIL_ALLOWED_DEEP_LINK_SCHEMES=multitenant
EMAIL_RECIPIENT_WINDOW_MINUTES=15
EMAIL_RECIPIENT_WINDOW_LIMIT=3
EMAIL_ACTOR_WINDOW_MINUTES=15
EMAIL_ACTOR_WINDOW_LIMIT=10
EMAIL_TENANT_DAILY_LIMIT=200
EMAIL_HOURLY_SEND_LIMIT=100
EMAIL_DAILY_SEND_LIMIT=500

# Dev only
PAYMENT_MOCK=false                    # true = mock all payment providers
SEED_DEFAULT_PASSWORD=                # For seed script only
```

## Package Scripts

```bash
# Development
npm run dev              # tsx watch src/index.ts

# Build
npm run build            # tsc
npm run start            # node dist/index.js

# Database
npx prisma migrate dev   # Dev migrations
npx prisma migrate deploy # Production migrations
npx prisma generate      # Regenerate client
npx prisma db seed       # Run seed
npx prisma studio        # Open Prisma Studio

# Testing
npm run test             # Vitest
npm run test:ui          # Vitest UI

# Lint
npm run lint             # ESLint
npm run format           # Prettier
```

## Infrastructure

| Service | Purpose | Notes |
|---------|---------|-------|
| Railway / Render / VPS | App hosting | Node.js 20+ required |
| PostgreSQL | Database | Managed instance (Railway, Supabase, AWS RDS) |
| Cloudinary | Image CDN | Free tier sufficient for small catalogs |
| Resend | Transactional email | Per-tenant from addresses supported |
| Stripe | Payment gateway (default) | Test mode for dev |
| Yappy | Payment gateway (Panama) | When implemented |

## Docker (Optional)

```dockerfile
# Dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build
EXPOSE 3001
CMD ["node", "dist/index.js"]
```

## Security Notes

1. `PAYMENT_MOCK=true` in production = all orders auto-pay. **Never.**
2. `ENCRYPTION_KEY` must be 32-byte hex. Generate with `openssl rand -hex 32`.
3. JWT secrets must be different for access and refresh.
4. All env vars must be in `.env` (gitignored). Verify `.gitignore`.
5. CORS is configured to allow only `FRONTEND_URL` in production.
6. Rate limiting recommended on `/auth/login` and `/orders`.
7. Cloudinary upload should validate file type and size server-side.
8. Database connections use SSL in production.
9. `PASSWORD_RESET_URL` and `TEAM_INVITE_URL` must be HTTPS in production unless they use an approved native deep link scheme from `EMAIL_ALLOWED_DEEP_LINK_SCHEMES`.
10. Transactional email sends are guarded by per-recipient, per-actor, per-tenant, hourly, and daily limits before calling Resend.
