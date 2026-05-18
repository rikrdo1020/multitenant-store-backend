import {
  BadRequestException,
  Injectable,
  NestMiddleware,
  NotFoundException,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { TenantService } from '../../modules/tenant/tenant.service';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private readonly tenantService: TenantService) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const slug = this.resolveSlug(req);

    if (!slug) {
      // Routes that don't require a tenant (auth, superadmin, health) still pass through
      return next();
    }

    const tenant = await this.tenantService.findBySlug(slug);

    if (!tenant) {
      throw new NotFoundException({ code: 'TENANT_NOT_FOUND', message: `Tenant '${slug}' not found` });
    }

    if (tenant.status !== 'active') {
      throw new BadRequestException({ code: 'TENANT_INACTIVE', message: `Tenant '${slug}' is not active` });
    }

    req.tenant = tenant;
    next();
  }

  private resolveSlug(req: Request): string | null {
    // 1. Explicit header
    const header = req.headers['x-tenant-id'];
    if (header && typeof header === 'string') return header;

    // 2. Query parameter
    const query = req.query['tenant'];
    if (query && typeof query === 'string') return query;

    // 3. Subdomain: only when host ends with APP_DOMAIN (e.g. "my-store.myapp.com")
    const appDomain = process.env.APP_DOMAIN;
    const host = req.hostname;
    if (appDomain && host && host.endsWith(`.${appDomain}`)) {
      const subdomain = host.slice(0, host.length - appDomain.length - 1);
      if (subdomain && subdomain !== 'www') return subdomain;
    }

    return null;
  }
}
