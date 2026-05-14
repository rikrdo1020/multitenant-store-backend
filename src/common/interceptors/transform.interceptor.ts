import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface TransformedResponse<T> {
  success: true;
  data: T;
  meta?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, TransformedResponse<T>> {
  intercept(
    _context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<TransformedResponse<T>> {
    return next.handle().pipe(
      map((data) => {
        // If the service already returned a paginated shape { items, meta }
        if (
          data !== null &&
          typeof data === 'object' &&
          'items' in (data as object) &&
          'meta' in (data as object)
        ) {
          const paginated = data as unknown as { items: unknown; meta: TransformedResponse<T>['meta'] };
          return {
            success: true as const,
            data: paginated.items as T,
            meta: paginated.meta,
          };
        }

        return { success: true as const, data };
      }),
    );
  }
}
