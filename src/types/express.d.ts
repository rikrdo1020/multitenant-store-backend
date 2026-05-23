import { Tenant, UserRole } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      tenant?: Tenant;
      user?: {
        sub: string;
        email: string;
        role: UserRole;
        tenantId?: string;
        type: 'access';
      };
    }
  }
}
