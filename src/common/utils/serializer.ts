import { Decimal } from '@prisma/client/runtime/library';

/**
 * Recursively transforms a Prisma result object:
 *  - Decimal → number
 *  - Date → ISO string
 *  - id field → documentId (id is removed)
 */
export function serialize<T>(data: T): unknown {
  if (data === null || data === undefined) return data;

  if (data instanceof Decimal) {
    return data.toNumber();
  }

  if (data instanceof Date) {
    return data.toISOString();
  }

  if (Array.isArray(data)) {
    return data.map(serialize);
  }

  if (typeof data === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (key === 'id') {
        result['documentId'] = value;
      } else {
        result[key] = serialize(value);
      }
    }
    return result;
  }

  return data;
}

export function serializeList<T>(
  items: T[],
  meta: { page: number; pageSize: number; total: number },
) {
  return {
    items: items.map(serialize),
    meta: {
      page: meta.page,
      pageSize: meta.pageSize,
      total: meta.total,
      totalPages: Math.ceil(meta.total / meta.pageSize),
    },
  };
}
