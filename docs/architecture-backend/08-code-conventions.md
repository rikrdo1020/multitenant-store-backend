# Backend Code Conventions

## Language

- API responses: **English** error codes and messages
- Code: **English** (variables, functions, types)
- Comments: **English**

## File Conventions

| Location | Rule |
|----------|------|
| `src/controllers/*.ts` | One controller per domain entity. Thin, delegates to services. |
| `src/services/*.ts` | One service per domain entity. Contains business logic. |
| `src/repositories/*.ts` | One repository per domain entity. Prisma queries only. |
| `src/routes/*.ts` | Route definitions. Composes middleware + controllers. |
| `src/middleware/*.ts` | Express middleware. Pure functions, no business logic. |
| `src/types/*.ts` | Domain TypeScript interfaces and Zod schemas. |
| `src/utils/*.ts` | Helpers, pricing engine, serializers. |
| `src/lib/*.ts` | External client initialization (Prisma, Cloudinary, Resend). |
| `src/config/*.ts` | Environment validation and app configuration. |

## Naming

- Files: `kebab-case.ts`
- Functions: `camelCase`
- Classes: `PascalCase`
- Constants: `UPPER_SNAKE_CASE`
- Types/Interfaces: `PascalCase`
- Database models: `PascalCase` (Prisma convention)

## Controller Pattern

```ts
export async function getProducts(req: Request, res: Response, next: NextFunction) {
  try {
    const { tenantId } = req.tenant;
    const filters = productFilterSchema.parse(req.query);
    const products = await productService.getProducts(tenantId, filters);
    res.json({ success: true, data: products });
  } catch (error) {
    next(error);
  }
}
```

## Service Pattern

```ts
export async function getProducts(tenantId: string, filters: ProductFilters) {
  const where = buildProductWhere(tenantId, filters);
  const [data, total] = await Promise.all([
    productRepository.findMany({ where, skip, take }),
    productRepository.count({ where }),
  ]);
  return { data: data.map(serializeProduct), meta: { page, pageSize, total } };
}
```

## Error Handling

All errors flow through the centralized error handler middleware.

```ts
// Custom error classes
class AppError extends Error {
  constructor(public code: string, public statusCode: number, message: string) {
    super(message);
  }
}

class ValidationError extends AppError {
  constructor(message: string, public details?: FieldError[]) {
    super('VALIDATION_ERROR', 422, message);
  }
}

class NotFoundError extends AppError {
  constructor(resource: string) {
    super('NOT_FOUND', 404, `${resource} not found`);
  }
}

class UnauthorizedError extends AppError {
  constructor() {
    super('UNAUTHORIZED', 401, 'Authentication required');
  }
}
```

## Validation

Use Zod for all input validation:

```ts
const createProductSchema = z.object({
  name: z.string().min(3).max(200),
  slug: z.string().min(3).max(200).optional(),
  price: z.number().positive(),
  discountPrice: z.number().positive().optional(),
  stock: z.number().int().min(0).default(0),
  categoryId: z.string().cuid().optional(),
  brandId: z.string().cuid().optional(),
  tags: z.array(z.string().cuid()).optional(),
});
```

## Repository Pattern

```ts
// repositories/product-repository.ts
export const productRepository = {
  findMany: (args: Prisma.ProductFindManyArgs) => prisma.product.findMany(args),
  findUnique: (args: Prisma.ProductFindUniqueArgs) => prisma.product.findUnique(args),
  create: (args: Prisma.ProductCreateArgs) => prisma.product.create(args),
  update: (args: Prisma.ProductUpdateArgs) => prisma.product.update(args),
  delete: (args: Prisma.ProductDeleteArgs) => prisma.product.delete(args),
  count: (args: Prisma.ProductCountArgs) => prisma.product.count(args),
};
```

## Serializer Usage

All service responses must serialize before returning:
```ts
return products.map(serializeProduct);
// id → documentId, Decimal → number, Date → ISO string
```

## Async Patterns

- Always use `async/await`, never raw `.then()` chains.
- Wrap controller handlers in `try/catch`, pass to `next(error)`.
- Use `Promise.all()` for independent parallel queries.

## Logging

```ts
import { logger } from '@/lib/logger';

logger.info('Order created', { orderId, tenantId });
logger.error('Payment failed', { error, orderId });
```

Never log:
- Passwords or password hashes
- JWT tokens
- Payment provider secrets
- Encryption keys
